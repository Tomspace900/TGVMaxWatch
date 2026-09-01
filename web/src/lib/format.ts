import { STATION_LABELS } from '../../../src/config.ts';

export { formatDuration, durationTier } from '../../../src/duration.ts';

const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

export function stationLabel(iata: string): string {
  return STATION_LABELS[iata] ?? iata;
}

export function dirLabel(dir: string): string {
  const [from = '', to = ''] = dir.split('>');
  return `${stationLabel(from)} → ${stationLabel(to)}`;
}

export function reverseDir(dir: string): string {
  const [from = '', to = ''] = dir.split('>');
  return `${to}>${from}`;
}

/** `ven 17 octobre`. */
export function longDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  const index = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).getUTCDay();
  return `${WEEKDAYS[index]} ${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

const WEEKDAYS_FULL = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];

const WEEKDAY_BY_KEY: Record<string, string> = {
  mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi',
  fri: 'vendredi', sat: 'samedi', sun: 'dimanche',
};

/** Traduit la cle d'une regle de watchlist (`fri`) en francais. */
export function weekdayName(key: string): string {
  return WEEKDAY_BY_KEY[key] ?? key;
}

/** Nom complet : « mar » en capitales se lirait comme le mois de mars. */
export function weekdayFull(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  const index = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).getUTCDay();
  return WEEKDAYS_FULL[index]!;
}

export function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

/** Age d'une donnee, en clair : `il y a 7 h`. */
export function ageLabel(isoInstant: string): string {
  const hours = Math.floor((Date.now() - Date.parse(isoInstant)) / 3_600_000);
  if (hours < 1) return "a l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}

export function hoursSince(isoInstant: string): number {
  return (Date.now() - Date.parse(isoInstant)) / 3_600_000;
}
