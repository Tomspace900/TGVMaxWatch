import { DRAIN_MAX_LEFT, DRAIN_MIN_DROP, REOPEN_MIN_TRAINS } from './config.ts';
import { recordDir, recordDuration, recordKey, durationTier } from './duration.ts';
import { countSnapshot } from './history.ts';
import type { DateSignal, DiffResult, Snapshot, TrainEvent, TrainRecord } from './types.ts';

/**
 * Compare deux snapshots consecutifs.
 *
 * Deux mailles differentes, et c'est voulu. Les evenements portent sur un train
 * — dont un que la source ne donne pas : un train qui disparait du dataset
 * n'est pas complet, il est supprime (travaux, greve, changement de service),
 * et confondre les deux fait croire a une saturation. Les signaux, eux, portent
 * sur le compte d'une (date, sens), la maille a laquelle on decide de partir.
 *
 * Ce module reste hors du graphe d'imports de `mobile/` : il tire `history.ts`,
 * donc `storage.ts`, donc `node:`. Le bundle Metro de `ci.yml` le verifie.
 */
export function diffSnapshots(previous: Snapshot, current: Snapshot, today: string): DiffResult {
  const before = index(previous);
  const after = index(current);

  const events: TrainEvent[] = [];

  for (const [key, record] of after) {
    const old = before.get(key);

    if (!old) {
      // Une cle inconnue sur une date deja suivie est un train ajoute au plan
      // de transport. On ne la signale que si elle est effectivement reservable.
      if (record.od_happy_card === 'OUI') events.push(toEvent('OPEN', record));
      continue;
    }

    if (old.od_happy_card === 'NON' && record.od_happy_card === 'OUI') {
      events.push(toEvent('OPEN', record));
    } else if (old.od_happy_card === 'OUI' && record.od_happy_card === 'NON') {
      events.push(toEvent('CLOSE', record));
    }
  }

  for (const [key, record] of before) {
    if (!after.has(key)) events.push(toEvent('REMOVED', record));
  }

  return { events: sortEvents(events), signals: findSignals(previous, current, today) };
}

/**
 * Les deux mouvements qui meritent de deranger, sans consulter de preference.
 *
 * Le plan du projet pariait sur l'entree d'une date a J+30, « le signal a plus
 * fort rendement », suppose apporter dix a quinze trains d'un coup. L'archive
 * dit le contraire : les quatre dates mesurees sont entrees a **zero place**
 * (0/35, 0/39, 0/33, 0/29) et se sont remplies le lendemain. L'alerte batie sur
 * l'entree exigeait `oui > 0` a l'entree : elle ne pouvait litteralement jamais
 * partir.
 *
 * C'est donc la transition qu'on regarde, pas l'entree — ce qui capte au
 * passage la remontee des dates proches, ou les places liberees la veille
 * reapparaissent en nombre : le 06/09 Paris > Bordeaux est passe de 1 a 17 en
 * une journee, a trois jours du depart.
 */
function findSignals(previous: Snapshot, current: Snapshot, today: string): DateSignal[] {
  const before = countAvailable(previous);
  const after = countAvailable(current);
  const signals: DateSignal[] = [];

  for (const [key, now] of after) {
    // Une cle absente du snapshot precedent est une date qui vient d'entrer
    // dans la fenetre. Elle entre a zero : il n'y a rien a annoncer avant que
    // ses places n'arrivent, ce qui se verra au diff suivant.
    const then = before.get(key);
    if (then === undefined) continue;

    const [date = '', dir = ''] = key.split('|');
    // Un train de ce matin n'interesse plus personne ce soir.
    if (date < today) continue;

    if (then === 0 && now >= REOPEN_MIN_TRAINS) {
      signals.push({ kind: 'REOPENED', date, dir, before: then, after: now });
    } else if (then - now >= DRAIN_MIN_DROP && now <= DRAIN_MAX_LEFT) {
      signals.push({ kind: 'DRAINING', date, dir, before: then, after: now });
    }
  }

  // Une reouverture passe avant une fonte : l'une ouvre une possibilite,
  // l'autre la ferme, et c'est la premiere qu'on veut lire en haut du message.
  const rank = (kind: DateSignal['kind']) => (kind === 'REOPENED' ? 0 : 1);

  return signals.sort(
    (a, b) =>
      rank(a.kind) - rank(b.kind) ||
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir),
  );
}

/** `<date>|<sens>` -> nombre de trains eligibles. */
function countAvailable(snapshot: Snapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [date, byDir] of countSnapshot(snapshot)) {
    for (const [dir, observation] of byDir) counts.set(`${date}|${dir}`, observation.oui);
  }
  return counts;
}

function index(snapshot: Snapshot): Map<string, TrainRecord> {
  return new Map(snapshot.map((record) => [recordKey(record), record]));
}

function toEvent(kind: TrainEvent['kind'], record: TrainRecord): TrainEvent {
  const durationMin = recordDuration(record);
  return {
    kind,
    date: record.date,
    dir: recordDir(record),
    trainNo: record.train_no,
    depart: record.heure_depart,
    arrivee: record.heure_arrivee,
    durationMin,
    tier: durationTier(durationMin),
  };
}

function sortEvents(events: TrainEvent[]): TrainEvent[] {
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir) ||
      a.depart.localeCompare(b.depart),
  );
}
