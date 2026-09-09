import { DIR_BORDEAUX_PARIS, DIR_PARIS_BORDEAUX } from '../src/config.ts';
import { foldDepartures, type Departure } from '../src/departures.ts';
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

/**
 * Raccourci : `t('2026-10-17', '8441', 'OUI', '16:12')`.
 *
 * L'arrivee se deduit du depart, elle n'est pas fixe. Une heure d'arrivee
 * constante donnait une duree qui variait avec le depart : un train de 12:46
 * arrivant a 10:10 durait vingt-et-une heures et tombait dans le palier
 * `long`, ce qui faisait sortir la duree dans les notifications d'un test qui
 * ne parlait pas de duree. Un fixture doit etre plausible sans que l'appelant
 * ait a y penser.
 */
export function t(
  date: string,
  trainNo: string,
  availability: Availability = 'OUI',
  depart = '08:00',
  dir: string = PB,
  durationMin = 130,
): TrainRecord {
  const [origine = 'FRPMO', destination = 'FRBOJ'] = dir.split('>');
  return {
    date,
    train_no: trainNo,
    origine_iata: origine,
    destination_iata: destination,
    heure_depart: depart,
    heure_arrivee: addMinutes(depart, durationMin),
    od_happy_card: availability,
  };
}

/** `08:00` + 130 -> `10:10`. Arithmetique de chaines, jamais de `Date`. */
function addMinutes(time: string, minutes: number): string {
  const [hours = '0', mins = '0'] = time.split(':');
  const total = Number(hours) * 60 + Number(mins) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function snapshot(...records: TrainRecord[]): Snapshot {
  return records;
}

/**
 * Le meme raccourci que `snapshot`, mais dans l'unite de compte du projet.
 *
 * Tout ce qui est en aval de la lecture compte des departs : deux rames a la
 * meme minute sont un seul train. Les tests passent donc par le meme repli que
 * la production, plutot que de fabriquer des departs a la main.
 */
export function departures(...records: TrainRecord[]): Departure[] {
  return foldDepartures(records);
}
