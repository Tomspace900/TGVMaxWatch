import { AVAILABILITY_BUCKETS, HORIZON_DAYS } from '../../src/config.ts';
import { addDays, todayInParis } from '../../src/dates.ts';
import { foldDepartures, type Departure } from '../../src/departures.ts';
import type { TrainRecord } from '../../src/types.ts';

/**
 * Ce que l'application appelle un train est un **depart**.
 *
 * Le dataset publie les deux rames d'un meme depart comme deux lignes ; pour
 * qui voyage c'est un seul train, meme minute et meme arrivee. Le type vient
 * donc de `src/departures.ts`, qui porte la regle — l'interface ne redefinit
 * pas ce que la source signifie.
 */
export type Train = Departure;

export interface Day {
  date: string;
  dir: string;
  trains: Train[];
  /** Departs eligibles. C'est ce que compte le calendrier. */
  available: number;
  /**
   * Vrai quand toutes les places du jour sont sur des trains de plus de 3h.
   * Sans ce marqueur, la couleur de la case mentirait.
   */
  onlyLong: boolean;
}

/*
 * La variation d'un jour a l'autre n'est plus calculee ici.
 *
 * Elle etait peinte dans chaque case — `+9`, `-1`, `+7` — et mettait un
 * troisieme nombre dans une surface qui n'en supporte pas trois, sur certaines
 * cases seulement, ce qui forcait l'oeil a chercher pourquoi. Personne ne lit
 * l'ecart d'hier a aujourd'hui : ce qu'on veut savoir, c'est ou en est *son*
 * creneau, et quelle est la tendance longue.
 *
 * La variation reste ce qu'elle a toujours ete utilement : le **declencheur**
 * des deux alertes generales, calcule cote collecteur dans `src/diff.ts`. Un
 * capteur, pas un affichage.
 */

/** Index `date -> sens -> jour`, construit une fois depuis `latest.json`. */
export type Calendar = Map<string, Map<string, Day>>;

export function buildCalendar(records: TrainRecord[]): Calendar {
  const calendar: Calendar = new Map();

  // `foldDepartures` rend deja les departs tries par date, sens puis heure :
  // chaque journee arrive donc dans l'ordre, sans tri supplementaire.
  for (const departure of foldDepartures(records)) {
    const byDir = calendar.get(departure.date) ?? new Map<string, Day>();
    calendar.set(departure.date, byDir);

    const day =
      byDir.get(departure.dir) ??
      ({ date: departure.date, dir: departure.dir, trains: [], available: 0, onlyLong: false } as Day);
    byDir.set(departure.dir, day);
    day.trains.push(departure);
  }

  for (const byDir of calendar.values()) {
    for (const day of byDir.values()) {
      const free = day.trains.filter((train) => train.available);
      day.available = free.length;
      day.onlyLong = free.length > 0 && free.every((train) => train.tier === 'long');
    }
  }

  return calendar;
}

/** Les 31 jours de la fenetre glissante, a partir d'aujourd'hui. */
export function horizonDates(today = todayInParis()): string[] {
  return Array.from({ length: HORIZON_DAYS + 1 }, (_, offset) => addDays(today, offset));
}

/** Palier de couleur d'une case : 0, 1-2, 3-5, 6-11, 12+ departs ouverts. */
export function availabilityBucket(count: number): number {
  let bucket = 0;
  AVAILABILITY_BUCKETS.forEach((floor, index) => {
    if (count >= floor) bucket = index;
  });
  return bucket;
}

export function emptyDay(date: string, dir: string): Day {
  return { date, dir, trains: [], available: 0, onlyLong: false };
}
