import { TRAIN_TREND_DAYS } from './config.ts';
import type { Departure } from './departures.ts';
import type { TrainTrends } from './types.ts';

/** Marqueur d'un depart absent du dataset ce jour-la : ni disponible, ni complet. */
const ABSENT = '-';

export interface TrainsBuilder {
  add(collectionDate: string, departures: Departure[]): void;
  finish(): TrainTrends;
}

/**
 * Disponibilite jour apres jour, depart par depart.
 *
 * `history.json` compte des places par date de voyage et par sens ; c'est la
 * bonne maille pour decider d'un jour, pas pour repondre a « ce train-la se
 * vide-t-il vite ? ». La question se pose devant une liste de trains, et
 * l'archive sait y repondre — c'est meme la seule chose que la source, qui
 * ecrase son dataset chaque jour, ne saura jamais dire.
 *
 * La cle est l'**heure de depart**, pas le numero de rame. Deux rames a la meme
 * minute sont un seul train pour qui voyage, et deux frises pour un seul depart
 * n'auraient jamais ete lues. L'heure a en prime l'avantage d'etre ce que
 * l'interface a sous la main.
 *
 * Comme `history.json` et `stats.json`, cette vue est entierement recalculee a
 * chaque execution : un bug d'agregation se repare en relancant le job.
 */
export function createTrainsBuilder(today: string): TrainsBuilder {
  // `<date>|<sens>` -> heure de depart -> date de collecte -> 'O' | 'N'
  const grid = new Map<string, Map<string, Map<string, string>>>();
  const collectionDates: string[] = [];

  return {
    add(collectionDate, departures) {
      collectionDates.push(collectionDate);

      for (const departure of departures) {
        // Seules les dates encore a venir interessent l'application, et cette
        // borne est ce qui empeche le fichier de grossir avec l'archive.
        if (departure.date < today) continue;

        const key = `${departure.date}|${departure.dir}`;
        const byDeparture = grid.get(key) ?? new Map<string, Map<string, string>>();
        grid.set(key, byDeparture);

        const byDate = byDeparture.get(departure.depart) ?? new Map<string, string>();
        byDeparture.set(departure.depart, byDate);
        byDate.set(collectionDate, departure.available ? 'O' : 'N');
      }
    },

    finish() {
      const dates = collectionDates.slice(-TRAIN_TREND_DAYS);
      const series: TrainTrends['series'] = {};

      for (const [key, byDeparture] of [...grid.entries()].sort()) {
        const trains: Record<string, string> = {};

        for (const [depart, byDate] of [...byDeparture.entries()].sort()) {
          const trace = dates.map((date) => byDate.get(date) ?? ABSENT).join('');
          // Un depart jamais vu sur la fenetre retenue n'apprend rien.
          if (!trace.includes('O') && !trace.includes('N')) continue;
          trains[depart] = trace;
        }

        if (Object.keys(trains).length > 0) series[key] = trains;
      }

      return { dates, series };
    },
  };
}
