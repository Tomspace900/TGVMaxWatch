import { AVAILABILITY_BUCKETS, HORIZON_DAYS } from '../../src/config.ts';
import { addDays, todayInParis } from '../../src/dates.ts';
import { carrierLabel, durationTier, recordDir, recordDuration } from '../../src/duration.ts';
import type { DurationTier, TrainRecord } from '../../src/types.ts';

export interface Train {
  trainNo: string;
  /** `OUIGO`, ou absent : voir `carrierLabel`. */
  carrier?: string;
  depart: string;
  arrivee: string;
  durationMin: number;
  tier: DurationTier;
  available: boolean;
}

export interface Day {
  date: string;
  dir: string;
  trains: Train[];
  /** Trains eligibles. C'est ce que compte le calendrier. */
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

  for (const record of records) {
    const dir = recordDir(record);
    const byDir = calendar.get(record.date) ?? new Map<string, Day>();
    calendar.set(record.date, byDir);

    const day =
      byDir.get(dir) ??
      ({ date: record.date, dir, trains: [], available: 0, onlyLong: false } as Day);
    byDir.set(dir, day);

    const durationMin = recordDuration(record);
    day.trains.push({
      trainNo: record.train_no,
      ...(carrierLabel(record.entity) ? { carrier: carrierLabel(record.entity)! } : {}),
      depart: record.heure_depart,
      arrivee: record.heure_arrivee,
      durationMin,
      tier: durationTier(durationMin),
      available: record.od_happy_card === 'OUI',
    });
  }

  for (const byDir of calendar.values()) {
    for (const day of byDir.values()) {
      day.trains.sort((a, b) => a.depart.localeCompare(b.depart));
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

/** Palier de couleur d'une case : 0, 1-2, 3-5, 6-11, 12+. */
export function availabilityBucket(count: number): number {
  let bucket = 0;
  AVAILABILITY_BUCKETS.forEach((floor, index) => {
    if (count >= floor) bucket = index;
  });
  return bucket;
}

/**
 * Numero du train qui part a cette heure-la, ou `null`.
 *
 * Une entree de surveillance ne retient qu'une date, un sens et une heure de
 * depart : c'est ce qui est stable d'un snapshot a l'autre, le numero de train
 * ne l'etant pas. Pour retrouver la trace d'un train surveille il faut donc
 * refaire le chemin inverse a la lecture.
 */
export function trainNoAt(
  calendar: Calendar,
  date: string,
  dir: string,
  depart: string,
): string | null {
  const train = calendar.get(date)?.get(dir)?.trains.find((entry) => entry.depart === depart);
  return train?.trainNo ?? null;
}

export function emptyDay(date: string, dir: string): Day {
  return { date, dir, trains: [], available: 0, onlyLong: false };
}
