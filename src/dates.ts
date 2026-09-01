/**
 * Helpers de date, partages entre le collecteur et la PWA.
 *
 * Regle absolue du projet : les dates de voyage du dataset sont des dates
 * locales francaises, jamais des instants. On les manipule donc comme des
 * chaines `YYYY-MM-DD`, et toute arithmetique passe par UTC midi pour
 * qu'aucun decalage horaire ne puisse deplacer un jour.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** `YYYY-MM-DD` -> instant UTC a midi, insensible aux changements d'heure. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/** Nombre de jours entiers de `from` a `to`. Negatif si `to` precede `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** Jour de la semaine, 0 = dimanche (comme `Date.prototype.getDay`). */
export function weekday(iso: string): number {
  return parseDate(iso).getUTCDay();
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function weekdayKey(iso: string): (typeof WEEKDAY_KEYS)[number] {
  return WEEKDAY_KEYS[weekday(iso)]!;
}

/**
 * Date du jour en Europe/Paris.
 *
 * Le cron tourne en UTC mais tout le domaine metier est francais : on ancre
 * donc la notion de « aujourd'hui » sur Paris, des deux cotes du projet.
 */
export function todayInParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Heure locale a Paris, 0-23. Sert a valider qu'un cron UTC tombe bien a 16h. */
export function hourInParis(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
}

/** `HH:MM` -> minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Normalise `06:06:00` ou `6:06` en `06:06`. */
export function normalizeTime(raw: string): string {
  const [h = '0', m = '0'] = raw.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}
