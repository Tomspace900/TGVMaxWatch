import {
  DURATION_DIRECT_MAX,
  DURATION_INTERMEDIATE_MAX,
  TRACKED_STATIONS,
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

/**
 * Ne retient que Montparnasse et Saint-Jean.
 *
 * Le filtre serveur porte sur les villes : le dataset renvoie aussi des departs
 * d'Austerlitz, qui ne sont pas le voyage surveille ici. Ce predicat s'applique
 * a la collecte comme a la relecture de l'archive, pour que les snapshots deja
 * ecrits ne reintroduisent pas ces lignes dans les agregats.
 */
export function isTracked(record: TrainRecord): boolean {
  return (
    TRACKED_STATIONS.includes(record.origine_iata) &&
    TRACKED_STATIONS.includes(record.destination_iata)
  );
}

/**
 * Transporteur affichable, ou `null`.
 *
 * Le champ `entity` du dataset ne porte pas le type de train : c'est un code
 * d'axe commercial pour les TGV INOUI (`SUDOUESTPA`, `PASUDOUEST`) et le
 * service pour les OUIGO. Seul le second apprend quelque chose — afficher
 * « PASUDOUEST » sur quatre lignes sur cinq serait du bruit, pas de
 * l'information.
 *
 * Cette regle vit avec les autres lecteurs d'enregistrement, et non dans une
 * interface : elle interprete la source, et une interface qu'on remplace ne
 * doit pas pouvoir l'emporter avec elle.
 */
export function carrierLabel(entity?: string): string | null {
  return entity?.toUpperCase().startsWith('OUIGO') ? 'OUIGO' : null;
}

/** Sens d'un enregistrement, sous la forme `FRPMO>FRBOJ`. */
export function recordDir(record: TrainRecord): string {
  return `${record.origine_iata}>${record.destination_iata}`;
}

/** Cle d'identite d'un train pour le diff : stable d'un snapshot a l'autre. */
export function recordKey(record: TrainRecord): string {
  return `${record.date}|${record.train_no}|${recordDir(record)}`;
}
