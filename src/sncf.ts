import { normalizeTime, isIsoDate } from './dates.ts';
import { DIRECTIONS } from './config.ts';
import { recordDir } from './duration.ts';
import type { Snapshot, TrainRecord } from './types.ts';

const DATASET = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax';

const WHERE =
  '(origine="PARIS (intramuros)" and destination="BORDEAUX ST JEAN")' +
  ' or (origine="BORDEAUX ST JEAN" and destination="PARIS (intramuros)")';

const SELECT =
  'date,train_no,origine_iata,destination_iata,heure_depart,heure_arrivee,od_happy_card';

/**
 * Plancher de vraisemblance. Le dataset renvoie ~2170 lignes pour cet axe ;
 * une reponse tronquee ou une modification de schema cote SNCF passerait
 * silencieusement sans ce garde-fou, et ecraserait un snapshot valide par un
 * snapshot vide.
 */
const MIN_RECORDS = 500;

const TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[sncf] ${label} : tentative ${attempt + 1} dans ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`[sncf] ${label} a echoue apres ${RETRY_DELAYS_MS.length + 1} tentatives`, {
    cause: lastError,
  });
}

/**
 * Date de derniere publication du dataset (`metas.default.data_processed`).
 *
 * C'est la seule chose a interroger avant tout traitement : la source ne
 * change qu'une fois par jour, et comparer cette valeur a celle stockee rend
 * le collecteur idempotent malgre les deux executions quotidiennes.
 */
export async function fetchDataProcessed(): Promise<string> {
  const response = await fetchWithRetry(DATASET, 'metadonnees');
  const meta = (await response.json()) as {
    metas?: { default?: { data_processed?: string } };
  };

  const processed = meta.metas?.default?.data_processed;
  if (!processed) {
    throw new Error('[sncf] `metas.default.data_processed` absent de la reponse');
  }
  return processed;
}

/** Un seul appel a l'export, tout le filtrage etant fait cote serveur. */
export async function fetchSnapshot(): Promise<Snapshot> {
  const params = new URLSearchParams({ where: WHERE, select: SELECT });
  const response = await fetchWithRetry(`${DATASET}/exports/json?${params}`, 'export');
  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error('[sncf] l export n a pas renvoye un tableau');
  }

  const records = normalize(payload);

  if (records.length < MIN_RECORDS) {
    throw new Error(
      `[sncf] ${records.length} lignes valides sur ${payload.length} recues, ` +
        `moins que le plancher de ${MIN_RECORDS} : reponse tronquee ou schema modifie`,
    );
  }

  warnOnUnexpectedDirections(records);
  return sortRecords(records);
}

/**
 * Ne garde que les lignes exploitables. On filtre plutot que de rejeter le lot
 * entier : une poignee de lignes nulles est normale cote SNCF, et le plancher
 * `MIN_RECORDS` reste le vrai garde-fou.
 */
function normalize(payload: unknown[]): TrainRecord[] {
  const records: TrainRecord[] = [];

  for (const row of payload) {
    if (typeof row !== 'object' || row === null) continue;
    const raw = row as Record<string, unknown>;

    const date = raw['date'];
    const trainNo = raw['train_no'];
    const origine = raw['origine_iata'];
    const destination = raw['destination_iata'];
    const depart = raw['heure_depart'];
    const arrivee = raw['heure_arrivee'];
    const happy = raw['od_happy_card'];

    if (typeof date !== 'string' || !isIsoDate(date)) continue;
    if (typeof trainNo !== 'string' && typeof trainNo !== 'number') continue;
    if (typeof origine !== 'string' || typeof destination !== 'string') continue;
    if (typeof depart !== 'string' || typeof arrivee !== 'string') continue;
    if (happy !== 'OUI' && happy !== 'NON') continue;

    records.push({
      date,
      train_no: String(trainNo),
      origine_iata: origine,
      destination_iata: destination,
      heure_depart: normalizeTime(depart),
      heure_arrivee: normalizeTime(arrivee),
      od_happy_card: happy,
    });
  }

  return records;
}

/**
 * Les deux sens attendus sont FRPMO><FRBOJ. Si la SNCF renvoie un autre code
 * gare pour « PARIS (intramuros) », on garde la ligne — perdre des donnees
 * silencieusement serait pire — mais on le signale dans le log de l'Action.
 */
function warnOnUnexpectedDirections(records: TrainRecord[]): void {
  const known = new Set<string>(DIRECTIONS);
  const unexpected = new Map<string, number>();

  for (const record of records) {
    const dir = recordDir(record);
    if (!known.has(dir)) {
      unexpected.set(dir, (unexpected.get(dir) ?? 0) + 1);
    }
  }

  for (const [dir, count] of unexpected) {
    console.warn(`[sncf] sens inattendu ${dir} : ${count} lignes conservees`);
  }
}

/** Tri stable, pour que le diff git d'un snapshot a l'autre reste lisible. */
export function sortRecords(records: TrainRecord[]): TrainRecord[] {
  return [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      recordDir(a).localeCompare(recordDir(b)) ||
      a.heure_depart.localeCompare(b.heure_depart) ||
      a.train_no.localeCompare(b.train_no),
  );
}
