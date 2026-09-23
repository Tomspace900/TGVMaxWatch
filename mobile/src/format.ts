import {
  CONFIRM_DAYS_BEFORE,
  CONFIRM_DEADLINE_HOUR,
  CONFIRM_OPEN_DAYS_BEFORE,
  CONFIRM_OPEN_REMINDER_HOUR,
  CONFIRM_WINDOW_HOURS,
  STATION_LABELS,
  WATCH_GRACE_HOURS,
} from '../../src/config.ts';
import { addDays } from '../../src/dates.ts';
import { weekdayShort } from '../../src/label.ts';

export { formatDuration } from '../../src/duration.ts';

const WEEKDAYS_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
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
  const { day, month } = parts(iso);
  // Les trois lettres du jour viennent de `src/label.ts` : la notification les
  // ecrit aussi, et deux tables qui divergeraient d'un rang seraient
  // impossibles a diagnostiquer depuis l'ecran.
  return `${weekdayShort(iso)} ${day} ${MONTHS[month - 1]}`;
}

/** Nom complet : « mar » en capitales se lirait comme le mois de mars. */
export function weekdayFull(iso: string): string {
  return WEEKDAYS_FULL[parts(iso).weekday]!;
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

/**
 * Instant de la veille du voyage, a une heure locale donnee.
 *
 * Volontairement construit avec le constructeur local et non par une
 * arithmetique UTC : c'est le seul endroit du projet ou l'heure qui compte est
 * celle de la montre de l'utilisateur, pas une date de voyage.
 */
export function eveOf(travelDate: string, hour: number): Date {
  const [year = '0', month = '0', day = '0'] = addDays(travelDate, -CONFIRM_DAYS_BEFORE).split('-');
  return new Date(Number(year), Number(month) - 1, Number(day), hour, 0, 0, 0);
}

/** Echeance de confirmation d'un voyage : passe cette heure, la place est perdue. */
export function confirmDeadline(travelDate: string): Date {
  return eveOf(travelDate, CONFIRM_DEADLINE_HOUR);
}

/**
 * Instant ou la confirmation devient possible, et ou l'on veut l'entendre.
 *
 * Deux bornes, et c'est la plus tardive qui gagne. La fenetre de confirmation
 * n'ouvre que `CONFIRM_WINDOW_HOURS` avant le depart : pour un train du soir,
 * 19 h l'avant-veille tombe **avant** cette ouverture, et un rappel qui demande
 * une action encore impossible n'est pas un rappel — c'est la regle que la
 * carte de confirmation applique deja, et elle vaut a plus forte raison pour un
 * message qu'on lit sur un ecran verrouille.
 *
 * Construit avec le constructeur local, comme `eveOf` et pour la meme raison :
 * l'heure qui compte ici est celle de la montre.
 */
export function confirmOpens(travelDate: string, depart: string): Date {
  const [year = '0', month = '0', day = '0'] = addDays(
    travelDate,
    -CONFIRM_OPEN_DAYS_BEFORE,
  ).split('-');
  const evening = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    CONFIRM_OPEN_REMINDER_HOUR,
    0,
    0,
    0,
  );
  const opens = new Date(
    departureInstant(travelDate, depart).getTime() - CONFIRM_WINDOW_HOURS * 3_600_000,
  );
  return evening.getTime() >= opens.getTime() ? evening : opens;
}

/**
 * Temps restant avant une echeance, court et sans fioriture.
 *
 * Un compte a rebours n'a pas a etre precis a la minute — il a a dire s'il faut
 * agir maintenant. `2 j` et `3 h` decident, `2 j 4 h 12 min` non.
 */
export function untilLabel(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return 'dépassée';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'moins d’une heure';
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

/**
 * L'horloge de l'appareil, sous la forme des dates de voyage.
 *
 * `AAAA-MM-JJ HH:MM`, deja recule de la periode de grace : les bornes d'un
 * suivi se comparent comme des chaines, une date de voyage ne se convertit pas.
 */
export function watchCutoff(now: Date = new Date()): string {
  const at = new Date(now.getTime() - WATCH_GRACE_HOURS * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Instant du depart, en heure locale de l'appareil. */
export function departureInstant(travelDate: string, depart: string): Date {
  const [year = '0', month = '0', day = '0'] = travelDate.split('-');
  const [hour = '0', minute = '0'] = depart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}
