import { timeToMinutes, weekdayKey } from './dates.ts';
import type { TrainEvent, WatchEntry, Watchlist, WatchRule } from './types.ts';

interface Candidate {
  date: string;
  dir: string;
  /** `HH:MM` de depart. Absent pour une date entiere. */
  depart?: string;
}

/**
 * Un evenement ne declenche une notification que s'il concerne une entree
 * `watch` explicite ou matche une `rule` recurrente.
 *
 * Le critere de reussite du projet est une semaine sans notification inutile :
 * en cas de bruit, resserrer la regle, ne jamais elargir ce filtre.
 */
export function matchesWatchlist(watchlist: Watchlist, candidate: Candidate): boolean {
  return (
    watchlist.watch.some((entry) => matchesEntry(entry, candidate)) ||
    watchlist.rules.some((rule) => matchesRule(rule, candidate))
  );
}

function matchesEntry(entry: WatchEntry, candidate: Candidate): boolean {
  if (entry.date !== candidate.date) return false;
  if (entry.dir && entry.dir !== candidate.dir) return false;
  return withinWindow(entry, candidate.depart);
}

function matchesRule(rule: WatchRule, candidate: Candidate): boolean {
  if (rule.weekday !== weekdayKey(candidate.date)) return false;
  if (rule.dir && rule.dir !== candidate.dir) return false;
  return withinWindow(rule, candidate.depart);
}

/**
 * Fenetre horaire, bornes inclusives.
 *
 * Sans heure de depart (cas d'une date entiere), une fenetre est consideree
 * satisfaite : c'est a l'appelant de verifier qu'au moins un train de la date
 * tombe dans la fenetre, ce qu'il sait faire et pas nous.
 */
function withinWindow(window: { after?: string; before?: string }, depart?: string): boolean {
  if (!depart) return true;
  const minutes = timeToMinutes(depart);
  if (window.after && minutes < timeToMinutes(window.after)) return false;
  if (window.before && minutes > timeToMinutes(window.before)) return false;
  return true;
}

/**
 * Evenements de train retenus par la watchlist.
 *
 * C'est desormais le **seul** usage de la watchlist dans les notifications :
 * les creneaux qu'on a explicitement mis en suivi. Les deux autres alertes —
 * une date qui rouvre, un creneau qui se vide — ne dependent d'aucune
 * preference et ne passent pas par ici. Les melanger etait le defaut d'origine :
 * une regle taillee pour amortir le bruit des ouvertures de train reduisait au
 * silence, six jours sur sept, un signal qui n'en produisait aucun.
 */
export function filterEvents(watchlist: Watchlist, events: TrainEvent[]): TrainEvent[] {
  return events.filter((event) =>
    matchesWatchlist(watchlist, { date: event.date, dir: event.dir, depart: event.depart }),
  );
}
