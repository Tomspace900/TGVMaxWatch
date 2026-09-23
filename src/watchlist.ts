import { addDays } from './dates.ts';
import type { Departure } from './departures.ts';
import type { Watch, Watchlist } from './types.ts';

/**
 * Le suivi : des fenetres datees, posees sur l'appareil.
 *
 * Module pur — l'application et les tests le lisent, le collecteur plus du
 * tout : la liste ne quitte plus le telephone.
 */

/** `2026-09-24` + `18:11` -> `2026-09-24 18:11`. Comparable comme une chaine. */
export function stamp(date: string, time: string): string {
  return `${date} ${time}`;
}

/** Un train seul : une fenetre fermee sur son heure de depart. */
export function isTrainWatch(watch: Watch): boolean {
  return watch.from === watch.to;
}

/** Le depart tombe-t-il dans la fenetre ? Bornes incluses. */
export function covers(watch: Watch, departure: Pick<Departure, 'date' | 'dir' | 'depart' | 'tier'>): boolean {
  if (departure.dir !== watch.dir) return false;
  if (watch.skipLong && departure.tier === 'long') return false;
  const at = stamp(departure.date, departure.depart);
  return watch.from <= at && at <= watch.to;
}

/** Les jours que la fenetre touche, du premier au dernier : ce que le calendrier marque. */
export function watchDays(watch: Watch): string[] {
  const days: string[] = [];
  for (let day = watch.from.slice(0, 10); day <= watch.to.slice(0, 10); day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * Ce qui distingue deux suivis, et rien d'autre.
 *
 * Deux objets qui decrivent la meme fenetre sont le meme suivi : l'interface
 * les comparait par identite, et un rafraichissement qui remplacait les objets
 * entre le rendu et le geste faisait echouer la suppression.
 */
export function watchKey(watch: Watch): string {
  return [watch.dir, watch.from, watch.to, watch.skipLong ? 'court' : ''].join('|');
}

export function hasWatch(list: Watchlist, watch: Watch): boolean {
  const key = watchKey(watch);
  return list.some((current) => watchKey(current) === key);
}

/** Poser ou retirer, toujours en retirant d'abord : rejouer le geste ne double rien. */
export function setWatch(list: Watchlist, watch: Watch, watched: boolean): Watchlist {
  const key = watchKey(watch);
  const rest = list.filter((current) => watchKey(current) !== key);
  return watched ? [...rest, watch] : rest;
}

/**
 * Ce qui est passe cesse d'exister.
 *
 * `cutoff` est l'instant courant deja recule de sa grace, sous la meme forme :
 * c'est l'appelant qui connait l'horloge.
 */
export function pruneWatch(list: Watchlist, cutoff: string): Watchlist {
  const kept = list.filter((watch) => watch.to >= cutoff);
  return kept.length === list.length ? list : kept;
}

/** Une valeur venue d'ailleurs — stockage, sauvegarde — ramenee a la forme attendue. */
export function parseWatchlist(value: unknown): Watchlist | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (item): item is Watch =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.dir === 'string' &&
      typeof item.from === 'string' &&
      typeof item.to === 'string' &&
      item.from <= item.to,
  );
}
