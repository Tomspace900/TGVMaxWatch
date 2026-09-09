import {
  CONFIRM_DAYS_BEFORE,
  CONFIRM_DEADLINE_HOUR,
  STATION_LABELS,
  WATCH_GRACE_HOURS,
} from '../../src/config.ts';
import { addDays } from '../../src/dates.ts';
import { weekdayShort } from '../../src/label.ts';
import { periodOf } from '../../src/periods.ts';

export { formatDuration } from '../../src/duration.ts';

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

/**
 * La fenetre d'un suivi, dite comme on y pense.
 *
 * Personne ne decide « apres 05:00 » : on decide « le matin ». La table de
 * `src/periods.ts` fait deja la traduction dans un sens ; ici c'est l'inverse,
 * et c'est le sens qui compte a la relecture. Une fenetre posee a la main dans
 * le depot ne nommera aucune periode connue — elle se relit alors par ses
 * bornes, ce qui est honnete plutot que faux.
 */
export function windowLabel(after?: string, before?: string): string | null {
  const period = periodOf(after, before);
  if (period) return period.label;
  if (!after && !before) return null;
  if (after && after === before) return `à ${after}`;
  if (after && before) return `de ${after} à ${before}`;
  return after ? `après ${after}` : `avant ${before}`;
}

/**
 * Une regle recurrente en toutes lettres : « chaque lundi matin ».
 *
 * Deux ecrans nomment la meme regle — la liste de suivi et le bouton du
 * formulaire qui la cree — et ils en disaient deux choses differentes :
 * « chaque lundi apres 5:00 » d'un cote, « Suivre les lundis » de l'autre, ou
 * la periode choisie disparaissait purement et simplement.
 */
export function recurringLabel(rule: { weekday: string; after?: string; before?: string }): string {
  const when = windowLabel(rule.after, rule.before);
  const day = weekdayName(rule.weekday);
  return when ? `chaque ${day} ${when}` : `chaque ${day}`;
}

/** Le meme creneau a l'imperatif, pour le bouton qui le pose. */
export function followLabel(rule: { weekday: string; after?: string; before?: string }): string {
  const when = windowLabel(rule.after, rule.before);
  const days = `${weekdayName(rule.weekday)}s`;
  return when ? `Suivre les ${days} ${when}` : `Suivre tous les ${days}`;
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
 * `isExpired` compare des chaines et jamais des `Date`, parce qu'une date de
 * voyage est une date locale francaise qu'on ne convertit pas. Il faut donc lui
 * donner l'instant courant sous la meme forme — deja recule de la periode de
 * grace, pour qu'il n'ait aucune arithmetique a faire.
 */
export function watchCutoff(now: Date = new Date()): { date: string; time: string } {
  const at = new Date(now.getTime() - WATCH_GRACE_HOURS * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** Instant du depart, en heure locale de l'appareil. */
export function departureInstant(travelDate: string, depart: string): Date {
  const [year = '0', month = '0', day = '0'] = travelDate.split('-');
  const [hour = '0', minute = '0'] = depart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}
