import { DIR_BORDEAUX_PARIS, DIR_PARIS_BORDEAUX } from '../src/config.ts';
import type { Availability, Snapshot, TrainRecord } from '../src/types.ts';

export const PB = DIR_PARIS_BORDEAUX;
export const BP = DIR_BORDEAUX_PARIS;

/** Fabrique une ligne de dataset, avec des valeurs par defaut plausibles. */
export function train(
  overrides: Partial<TrainRecord> & { date: string; train_no: string },
): TrainRecord {
  const [origine = 'FRPMO', destination = 'FRBOJ'] = (overrides.origine_iata
    ? [overrides.origine_iata, overrides.destination_iata]
    : []) as string[];

  return {
    origine_iata: origine,
    destination_iata: destination ?? 'FRBOJ',
    heure_depart: '08:00',
    heure_arrivee: '10:10',
    od_happy_card: 'OUI',
    ...overrides,
  };
}

/** Raccourci : `t('2026-10-17', '8441', 'OUI', '16:12')`. */
export function t(
  date: string,
  trainNo: string,
  availability: Availability = 'OUI',
  depart = '08:00',
  dir: string = PB,
): TrainRecord {
  const [origine = 'FRPMO', destination = 'FRBOJ'] = dir.split('>');
  return {
    date,
    train_no: trainNo,
    origine_iata: origine,
    destination_iata: destination,
    heure_depart: depart,
    heure_arrivee: '10:10',
    od_happy_card: availability,
  };
}

export function snapshot(...records: TrainRecord[]): Snapshot {
  return records;
}
