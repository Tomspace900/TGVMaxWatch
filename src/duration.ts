import {
  DURATION_DIRECT_MAX,
  DURATION_INTERMEDIATE_MAX,
} from './config.ts';
import { timeToMinutes } from './dates.ts';
import type { DurationTier, TrainRecord } from './types.ts';

/**
 * Duree de trajet en minutes.
 *
 * Un train qui arrive « avant » son depart a franchi minuit : on ajoute 24h.
 * C'est rare sur cet axe mais un 23h50 -> 02h15 produirait sinon une duree
 * negative, donc un palier `direct` totalement faux.
 */
export function durationMinutes(depart: string, arrivee: string): number {
  const start = timeToMinutes(depart);
  const end = timeToMinutes(arrivee);
  return end >= start ? end - start : end + 24 * 60 - start;
}

/**
 * Palier de duree.
 *
 * Un train long reste reservable et ne doit jamais disparaitre de la liste,
 * mais il doit etre identifiable d'un coup d'oeil comme un mauvais choix.
 */
export function durationTier(minutes: number): DurationTier {
  if (minutes <= DURATION_DIRECT_MAX) return 'direct';
  if (minutes <= DURATION_INTERMEDIATE_MAX) return 'intermediaire';
  return 'long';
}

export function recordDuration(record: TrainRecord): number {
  return durationMinutes(record.heure_depart, record.heure_arrivee);
}

export function recordTier(record: TrainRecord): DurationTier {
  return durationTier(recordDuration(record));
}

/** Duree en toutes lettres : `2h14`, `3h05`. Jamais un nombre nu de minutes. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Sens d'un enregistrement, sous la forme `FRPMO>FRBOJ`. */
export function recordDir(record: TrainRecord): string {
  return `${record.origine_iata}>${record.destination_iata}`;
}

/** Cle d'identite d'un train pour le diff : stable d'un snapshot a l'autre. */
export function recordKey(record: TrainRecord): string {
  return `${record.date}|${record.train_no}|${recordDir(record)}`;
}
