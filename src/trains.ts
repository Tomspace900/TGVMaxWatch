import { TRAIN_TREND_DAYS } from './config.ts';
import { recordDir } from './duration.ts';
import type { Snapshot, TrainTrends } from './types.ts';

/** Marqueur d'un train absent du dataset ce jour-la : ni disponible, ni complet. */
const ABSENT = '-';

export interface TrainsBuilder {
  add(collectionDate: string, snapshot: Snapshot): void;
  finish(): TrainTrends;
}

/**
 * Disponibilite jour apres jour, train par train.
 *
 * `history.json` compte des places par date de voyage et par sens ; c'est la
 * bonne maille pour decider d'un jour, pas pour repondre a « ce train-la se
 * vide-t-il vite ? ». La question se pose devant une liste de trains, et
 * l'archive sait y repondre — c'est meme la seule chose que la source, qui
 * ecrase son dataset chaque jour, ne saura jamais dire.
 *
 * Comme `history.json` et `stats.json`, cette vue est entierement recalculee a
 * chaque execution : un bug d'agregation se repare en relancant le job.
 */
export function createTrainsBuilder(today: string): TrainsBuilder {
  // `<date>|<sens>` -> numero de train -> date de collecte -> 'O' | 'N'
  const grid = new Map<string, Map<string, Map<string, string>>>();
  const collectionDates: string[] = [];

  return {
    add(collectionDate, snapshot) {
      collectionDates.push(collectionDate);

      for (const record of snapshot) {
        // Seules les dates encore a venir interessent l'application, et cette
        // borne est ce qui empeche le fichier de grossir avec l'archive.
        if (record.date < today) continue;

        const key = `${record.date}|${recordDir(record)}`;
        const byTrain = grid.get(key) ?? new Map<string, Map<string, string>>();
        grid.set(key, byTrain);

        const byDate = byTrain.get(record.train_no) ?? new Map<string, string>();
        byTrain.set(record.train_no, byDate);
        byDate.set(collectionDate, record.od_happy_card === 'OUI' ? 'O' : 'N');
      }
    },

    finish() {
      const dates = collectionDates.slice(-TRAIN_TREND_DAYS);
      const series: TrainTrends['series'] = {};

      for (const [key, byTrain] of [...grid.entries()].sort()) {
        const trains: Record<string, string> = {};

        for (const [trainNo, byDate] of [...byTrain.entries()].sort()) {
          const trace = dates.map((date) => byDate.get(date) ?? ABSENT).join('');
          // Un train jamais vu sur la fenetre retenue n'apprend rien.
          if (!trace.includes('O') && !trace.includes('N')) continue;
          trains[trainNo] = trace;
        }

        if (Object.keys(trains).length > 0) series[key] = trains;
      }

      return { dates, series };
    },
  };
}
