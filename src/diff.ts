import { recordDir, recordDuration, recordKey, durationTier } from './duration.ts';
import type { DiffResult, NewDate, Snapshot, TrainEvent, TrainRecord } from './types.ts';

/**
 * Compare deux snapshots consecutifs.
 *
 * Quatre signaux, dont un que la source ne donne pas directement : un train qui
 * disparait du dataset n'est pas complet, il est supprime (travaux, greve,
 * changement de service). Confondre les deux fait croire a une saturation.
 */
export function diffSnapshots(previous: Snapshot, current: Snapshot): DiffResult {
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

  return { events: sortEvents(events), newDates: findNewDates(previous, current) };
}

/**
 * Dates de voyage entrant dans la fenetre glissante.
 *
 * C'est le signal a plus fort rendement du projet : une date entre a J+30 avec
 * 10-15 trains eligibles, contre 1-3 a J-10. Elle n'apparait qu'une seule fois.
 */
function findNewDates(previous: Snapshot, current: Snapshot): NewDate[] {
  const known = new Set(previous.map((record) => record.date));
  const counts = new Map<string, NewDate>();

  for (const record of current) {
    if (known.has(record.date)) continue;

    const dir = recordDir(record);
    const key = `${record.date}|${dir}`;
    let entry = counts.get(key);
    if (!entry) {
      entry = { date: record.date, dir, oui: 0, total: 0 };
      counts.set(key, entry);
    }

    entry.total++;
    if (record.od_happy_card === 'OUI') entry.oui++;
  }

  return [...counts.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.dir.localeCompare(b.dir),
  );
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
