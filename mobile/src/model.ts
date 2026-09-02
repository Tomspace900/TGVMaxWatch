import { AVAILABILITY_BUCKETS, HORIZON_DAYS } from '../../src/config.ts';
import { addDays, todayInParis } from '../../src/dates.ts';
import { carrierLabel, durationTier, recordDir, recordDuration } from '../../src/duration.ts';
import type { DurationTier, History, TrainRecord } from '../../src/types.ts';

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
  /** Variation depuis l'observation precedente, `null` sans historique. */
  delta: number | null;
  /**
   * Vrai quand toutes les places du jour sont sur des trains de plus de 3h.
   * Sans ce marqueur, la couleur de la case mentirait.
   */
  onlyLong: boolean;
}

/** Index `date -> sens -> jour`, construit une fois depuis `latest.json`. */
export type Calendar = Map<string, Map<string, Day>>;

export function buildCalendar(records: TrainRecord[], history: History): Calendar {
  const calendar: Calendar = new Map();

  for (const record of records) {
    const dir = recordDir(record);
    const byDir = calendar.get(record.date) ?? new Map<string, Day>();
    calendar.set(record.date, byDir);

    const day =
      byDir.get(dir) ??
      ({ date: record.date, dir, trains: [], available: 0, delta: null, onlyLong: false } as Day);
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
      day.delta = deltaFor(history, day.date, day.dir);
    }
  }

  return calendar;
}

/** Variation du nombre de places entre les deux dernieres observations. */
function deltaFor(history: History, date: string, dir: string): number | null {
  const series = history[date]?.[dir];
  if (!series || series.length < 2) return null;
  return series[series.length - 1]!.oui - series[series.length - 2]!.oui;
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

export function emptyDay(date: string, dir: string): Day {
  return { date, dir, trains: [], available: 0, delta: null, onlyLong: false };
}
