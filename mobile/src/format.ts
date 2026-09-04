import { STATION_LABELS } from '../../src/config.ts';

export { formatDuration } from '../../src/duration.ts';

const WEEKDAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const WEEKDAYS_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKDAY_BY_KEY: Record<string, string> = {
  mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi',
  fri: 'vendredi', sat: 'samedi', sun: 'dimanche',
};
const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

/** Les dates de voyage sont des dates locales : on les lit, on ne les convertit pas. */
function parts(iso: string): { day: number; month: number; weekday: number } {
  const [year = '', month = '', day = ''] = iso.split('-');
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).getUTCDay();
  return { day: Number(day), month: Number(month), weekday };
}

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
  const { day, month, weekday } = parts(iso);
  return `${WEEKDAYS_SHORT[weekday]} ${day} ${MONTHS[month - 1]}`;
}

/** Nom complet : « mar » en capitales se lirait comme le mois de mars. */
export function weekdayFull(iso: string): string {
  return WEEKDAYS_FULL[parts(iso).weekday]!;
}

/** Traduit la cle d'une regle de watchlist (`fri`) en francais. */
export function weekdayName(key: string): string {
  return WEEKDAY_BY_KEY[key] ?? key;
}

export function dayNumber(iso: string): string {
  return String(parts(iso).day);
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

/** Instant date et heure : `4 sept. · 08:12`. */
export function instantLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const month = MONTHS[date.getMonth()]?.slice(0, 4) ?? '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${month}. · ${hh}:${mm}`;
}

/**
 * Jeton masque : `github_pat_…a1b2`.
 *
 * Assez pour reconnaitre lequel est enregistre, jamais assez pour le recopier.
 * Un secret affiché en clair dans un ecran qu'on ouvre devant quelqu'un n'a
 * aucune raison de l'etre.
 */
export function maskToken(token: string): string {
  const head = token.slice(0, 11);
  const tail = token.slice(-4);
  return token.length <= 15 ? '••••' : `${head}…${tail}`;
}
