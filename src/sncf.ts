import { normalizeTime, isIsoDate } from './dates.ts';
import { DIRECTIONS } from './config.ts';
import { recordDir } from './duration.ts';
import type { Snapshot, TrainRecord } from './types.ts';

/**
 * Point d'entree du dataset.
 *
 * `TGVMAX_DATASET_URL` sert a rejouer la chaine complete contre un faux
 * endpoint : le vrai domaine n'est pas joignable depuis tous les
 * environnements de developpement.
 */
const DATASET =
  process.env['TGVMAX_DATASET_URL'] ??
  'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax';

const WHERE =
  '(origine="PARIS (intramuros)" and destination="BORDEAUX ST JEAN")' +
  ' or (origine="BORDEAUX ST JEAN" and destination="PARIS (intramuros)")';

/** Colonnes indispensables. Leur absence est une rupture de contrat. */
const REQUIRED_FIELDS = [
  'date',
  'train_no',
  'origine_iata',
  'destination_iata',
  'heure_depart',
  'heure_arrivee',
  'od_happy_card',
];

/**
 * Colonnes utiles mais non vitales.
 *
 * On ne les demande que si le dataset les declare : un `select` portant une
 * colonne inconnue renvoie 400, et le collecteur quotidien tomberait pour un
 * simple agrement d'affichage.
 */
const OPTIONAL_FIELDS = ['entity', 'axe'];

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

export interface DatasetInfo {
  /** `metas.default.data_processed`, en ISO 8601. */
  dataProcessed: string;
  /** Colonnes reellement declarees par le dataset. */
  fields: string[];
}

/**
 * Metadonnees du dataset.
 *
 * Un seul appel donne les deux choses dont on a besoin avant tout traitement :
 * la date de publication — la source ne change qu'une fois par jour, et la
 * comparer a celle stockee rend le collecteur idempotent malgre les deux
 * executions quotidiennes — et la liste des colonnes, qui evite de deviner le
 * nom d'un champ optionnel.
 */
export async function fetchDatasetInfo(): Promise<DatasetInfo> {
  const response = await fetchWithRetry(DATASET, 'metadonnees');
  const meta = (await response.json()) as {
    metas?: { default?: { data_processed?: string } };
    fields?: { name?: string }[];
  };

  const dataProcessed = meta.metas?.default?.data_processed;
  if (!dataProcessed) {
    throw new Error('[sncf] `metas.default.data_processed` absent de la reponse');
  }

  const fields = (meta.fields ?? [])
    .map((field) => field.name)
    .filter((name): name is string => typeof name === 'string');

  return { dataProcessed, fields };
}

/** Colonnes a demander, compte tenu de ce que le dataset declare. */
export function selectFor(available: string[]): string[] {
  const declared = new Set(available);

  // Un dataset qui ne declare rien du tout (reponse inattendue) ne doit pas
  // faire perdre les colonnes vitales : on les demande alors quand meme, et
  // c'est l'export qui tranchera.
  const optional =
    declared.size === 0 ? [] : OPTIONAL_FIELDS.filter((field) => declared.has(field));

  if (optional.length > 0) {
    console.log(`[sncf] colonnes optionnelles disponibles : ${optional.join(', ')}`);
  }

  return [...REQUIRED_FIELDS, ...optional];
}

/** Un seul appel a l'export, tout le filtrage etant fait cote serveur. */
export async function fetchSnapshot(fields: string[]): Promise<Snapshot> {
  const params = new URLSearchParams({ where: WHERE, select: fields.join(',') });
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

    const record: TrainRecord = {
      date,
      train_no: String(trainNo),
      origine_iata: origine,
      destination_iata: destination,
      heure_depart: normalizeTime(depart),
      heure_arrivee: normalizeTime(arrivee),
      od_happy_card: happy,
    };

    // Optionnelle : absente tant que le dataset ne la declare pas.
    const entity = raw['entity'];
    if (typeof entity === 'string' && entity.length > 0) record.entity = entity;

    records.push(record);
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
