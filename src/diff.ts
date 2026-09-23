import {
  DECISION_HORIZON_DAYS,
  DRAIN_MAX_LEFT,
  DRAIN_MIN_DROP,
  REOPEN_MIN_TRAINS,
} from './config.ts';
import { daysBetween } from './dates.ts';
import type { Departure } from './departures.ts';
import type { DateSignal } from './types.ts';

/**
 * Les deux alertes generales, sur le compte d'une (date, sens).
 *
 * Elles ne consultent aucun suivi. Deux garde-fous seulement, tous deux
 * mesures sur l'archive :
 *
 * - `REOPEN_MIN_TRAINS` : une date entre dans la fenetre a zero et se remplit
 *   le lendemain, de dix trains ou d'un seul — seul le premier cas est une
 *   nouvelle. C'est la transition qu'on regarde, jamais l'entree.
 * - `DECISION_HORIZON_DAYS` : 8 des 11 `REOPENED` de l'archive portaient sur
 *   J+21 a J+30, aucun sur J+0 a J+2. Une date qui se remplit a trois semaines
 *   est la mecanique de l'horizon, pas une nouvelle.
 *
 * Module pur : c'est le telephone qui le fait tourner.
 */
export function dateSignals(previous: Departure[], current: Departure[], today: string): DateSignal[] {
  const before = countOpen(previous);
  const after = countOpen(current);
  const signals: DateSignal[] = [];

  for (const [key, now] of after) {
    // Absente du releve precedent : la date vient d'entrer, elle entre a zero.
    const then = before.get(key);
    if (then === undefined) continue;

    const [date = '', dir = ''] = key.split('|');
    if (date < today || daysBetween(today, date) > DECISION_HORIZON_DAYS) continue;

    if (then === 0 && now >= REOPEN_MIN_TRAINS) {
      signals.push({ kind: 'REOPENED', date, dir, before: then, after: now });
    } else if (then - now >= DRAIN_MIN_DROP && now <= DRAIN_MAX_LEFT) {
      signals.push({ kind: 'DRAINING', date, dir, before: then, after: now });
    }
  }

  const rank = (kind: DateSignal['kind']) => (kind === 'REOPENED' ? 0 : 1);
  return signals.sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.date.localeCompare(b.date) || a.dir.localeCompare(b.dir),
  );
}

/** `<date>|<sens>` -> departs ouverts. Toutes les cles, meme a zero. */
function countOpen(departures: Departure[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const departure of departures) {
    const key = `${departure.date}|${departure.dir}`;
    counts.set(key, (counts.get(key) ?? 0) + (departure.available ? 1 : 0));
  }
  return counts;
}
