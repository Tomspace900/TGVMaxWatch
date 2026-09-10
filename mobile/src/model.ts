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
}

/*
 * `onlyLong` a disparu avec la ligne qui le lisait.
 *
 * Il servait a ecrire « tous sur des trajets de plus de 3 h » dans l'encart
 * d'une journee — une information que la pastille `LONG` de chaque ligne et le
 * compteur du filtre `longs` portent deja, juste en dessous. Et le cas ou elle
 * comptait vraiment, un filtre qui masque les longs alors qu'ils sont les seuls
 * ouverts, est deja couvert : la liste vide dit qu'elle l'est a cause des
 * filtres. Un champ calcule que personne ne lit finit par etre recopie ailleurs
 * comme s'il faisait autorite.
 */

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
      ({ date: departure.date, dir: departure.dir, trains: [], available: 0 } as Day);
    byDir.set(departure.dir, day);
    day.trains.push(departure);
  }

  for (const byDir of calendar.values()) {
    for (const day of byDir.values()) {
      day.available = day.trains.filter((train) => train.available).length;
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
  return { date, dir, trains: [], available: 0 };
}
