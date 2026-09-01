import { HISTORY_RETENTION_DAYS } from './config.ts';
import { addDays } from './dates.ts';
import { recordDir } from './duration.ts';
import { listSnapshotDates, readSnapshot } from './storage.ts';
import type { History, Observation, Snapshot } from './types.ts';

/** Compte les OUI/NON d'un snapshot, par date de voyage puis par sens. */
export function countSnapshot(snapshot: Snapshot): Map<string, Map<string, Observation>> {
  const byDate = new Map<string, Map<string, Observation>>();

  for (const record of snapshot) {
    let byDir = byDate.get(record.date);
    if (!byDir) {
      byDir = new Map();
      byDate.set(record.date, byDir);
    }

    const dir = recordDir(record);
    let observation = byDir.get(dir);
    if (!observation) {
      observation = { d: '', oui: 0, non: 0 };
      byDir.set(dir, observation);
    }

    if (record.od_happy_card === 'OUI') observation.oui++;
    else observation.non++;
  }

  return byDate;
}

export interface HistoryBuilder {
  add(collectionDate: string, snapshot: Snapshot): void;
  finish(today: string): History;
}

/**
 * Accumulateur d'historique, alimente snapshot par snapshot.
 *
 * Les snapshots sont fournis dans l'ordre chronologique par l'appelant, ce qui
 * garde les series d'observations ordonnees sans tri final.
 */
export function createHistoryBuilder(): HistoryBuilder {
  const history: History = {};

  return {
    add(collectionDate, snapshot) {
      for (const [travelDate, byDir] of countSnapshot(snapshot)) {
        const entry = (history[travelDate] ??= {});
        for (const [dir, observation] of byDir) {
          (entry[dir] ??= []).push({ ...observation, d: collectionDate });
        }
      }
    },
    finish(today) {
      return purgeHistory(history, today);
    },
  };
}

/**
 * Reconstruit `history.json` a partir de l'ensemble des snapshots archives.
 *
 * Recalculer plutot qu'incrementer coute environ une seconde pour une centaine
 * de snapshots, et rend le fichier auto-reparable : un bug d'agregation se
 * corrige par un simple re-run, au lieu de rester grave dans l'historique.
 */
export function rebuildHistory(today: string, dates = listSnapshotDates()): History {
  const builder = createHistoryBuilder();
  for (const collectionDate of dates) {
    builder.add(collectionDate, readSnapshot(collectionDate));
  }
  return builder.finish(today);
}

/** Supprime les dates de voyage anterieures a J-`HISTORY_RETENTION_DAYS`. */
export function purgeHistory(history: History, today: string): History {
  const floor = addDays(today, -HISTORY_RETENTION_DAYS);
  const kept: History = {};

  for (const [travelDate, byDir] of Object.entries(history)) {
    if (travelDate >= floor) kept[travelDate] = byDir;
  }

  return kept;
}
