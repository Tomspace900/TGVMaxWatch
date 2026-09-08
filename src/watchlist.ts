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
export function withinWindow(
  window: { after?: string; before?: string },
  depart?: string,
): boolean {
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

/**
 * Une entree dont le train est parti.
 *
 * La comparaison est faite sur des chaines, jamais sur des `Date` : les dates
 * de voyage sont des dates locales francaises et ne doivent pas etre
 * converties. L'appelant fournit l'instant courant deja recule de sa periode de
 * grace, sous la meme forme — c'est lui qui connait l'horloge.
 *
 * Sans heure de depart, l'entree porte la journee entiere : elle n'expire donc
 * qu'une fois le dernier train parti.
 */
export function isExpired(
  entry: { date: string; after?: string },
  cutoff: { date: string; time: string },
): boolean {
  const depart = entry.after ?? '23:59';
  if (entry.date !== cutoff.date) return entry.date < cutoff.date;
  return depart < cutoff.time;
}

/** La watchlist debarrassee de ce qui est parti. */
export function pruneWatch(
  watchlist: Watchlist,
  cutoff: { date: string; time: string },
): Watchlist {
  const watch = watchlist.watch.filter((entry) => !isExpired(entry, cutoff));
  return watch.length === watchlist.watch.length ? watchlist : { ...watchlist, watch };
}

/**
 * Cle canonique d'une entree, et de meme pour une regle.
 *
 * Deux objets qui decrivent la meme fenetre sont la meme entree. L'interface
 * les comparait par identite d'objet (`entry !== target`) : un rafraichissement
 * remplacait les objets entre le rendu et le geste, le filtre ne trouvait plus
 * rien a retirer, et la suppression partait quand meme en commit. L'entree
 * « supprimee » etait toujours la au rechargement suivant.
 *
 * Une cle plutot qu'une comparaison champ a champ parce que trois ecrans
 * comparaient deja ces objets, chacun a sa maniere, et que `undefined` face a
 * `''` s'y decidait trois fois.
 */
export function watchKey(entry: WatchEntry): string {
  return [entry.date, entry.dir ?? '', entry.after ?? '', entry.before ?? ''].join('|');
}

export function ruleKey(rule: WatchRule): string {
  return [rule.weekday, rule.dir ?? '', rule.after ?? '', rule.before ?? ''].join('|');
}

export function hasWatch(watchlist: Watchlist, entry: WatchEntry): boolean {
  const key = watchKey(entry);
  return watchlist.watch.some((current) => watchKey(current) === key);
}

export function hasRule(watchlist: Watchlist, rule: WatchRule): boolean {
  const key = ruleKey(rule);
  return watchlist.rules.some((current) => ruleKey(current) === key);
}

/**
 * Poser ou retirer un suivi, toujours en retirant d'abord.
 *
 * Meme raison que `toggleBooking` : l'ecriture est idempotente par
 * construction, et non conditionnee a un etat lu depuis le rendu precedent.
 * Rejouer deux fois le meme geste ne peut donc ni doubler une entree ni en
 * laisser une derriere.
 */
export function setWatch(watchlist: Watchlist, entry: WatchEntry, watched: boolean): Watchlist {
  const key = watchKey(entry);
  const watch = watchlist.watch.filter((current) => watchKey(current) !== key);
  if (watched) watch.push(entry);
  return { ...watchlist, watch };
}

export function setRule(watchlist: Watchlist, rule: WatchRule, active: boolean): Watchlist {
  const key = ruleKey(rule);
  const rules = watchlist.rules.filter((current) => ruleKey(current) !== key);
  if (active) rules.push(rule);
  return { ...watchlist, rules };
}

/**
 * Une valeur venue d'ailleurs, ramenee a la forme attendue.
 *
 * Le fichier du depot peut avoir ete edite a la main, et une lecture reseau
 * ratee rendait jusqu'ici une liste vide indiscernable d'une vraie liste vide.
 * Ici on refuse ce qui n'est pas une watchlist ; c'est a l'appelant de decider
 * quoi faire du refus, et il ne peut le decider que s'il le voit.
 */
export function parseWatchlist(value: unknown): Watchlist | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record['watch']) || !Array.isArray(record['rules'])) return null;

  const watch = (record['watch'] as unknown[]).filter(isWindow).map((entry) => entry as WatchEntry);
  const rules = (record['rules'] as unknown[])
    .filter((rule) => isWindow(rule) && typeof (rule as WatchRule).weekday === 'string')
    .map((rule) => rule as WatchRule);

  return { watch, rules };
}

function isWindow(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
