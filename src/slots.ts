import {
  SLOT_FILL_MAX_BEFORE,
  SLOT_FILL_MIN_RISE,
  SLOT_OPEN_MIN_TRAINS,
  SLOT_SCARCE_MAX_LEFT,
} from './config.ts';
import type { Departure } from './departures.ts';
import { covers } from './watchlist.ts';
import type { Watchlist, WatchSignal } from './types.ts';

/**
 * Ce qui bouge dans ce qu'on suit, entre le dernier releve vu et celui-ci.
 *
 * Module pur : c'est le telephone qui le fait tourner, parce que c'est lui
 * seul qui connait la liste.
 */

/** Departs de la fenetre : ouverts, et total qui circule. */
function count(departures: Departure[], watch: Watchlist[number]): { oui: number; total: number } {
  let oui = 0;
  let total = 0;
  for (const departure of departures) {
    if (!covers(watch, departure)) continue;
    total++;
    if (departure.available) oui++;
  }
  return { oui, total };
}

/**
 * Le verbe que merite un mouvement, ou rien.
 *
 * La rarete decide d'une baisse, pas son ampleur : l'ancienne regle exigeait
 * une chute d'au moins deux et laissait passer `2 -> 1` a deux jours du depart,
 * exactement la nouvelle attendue. Une hausse ne se dit que si elle sort de la
 * rarete : `1 -> 7` est une nouvelle, `5 -> 9` non.
 *
 * Sur un train seul, le compte vaut 0 ou 1 : seuls « ouvre » et « se ferme »
 * peuvent sortir.
 */
function verb(before: number, after: number): WatchSignal['kind'] | null {
  if (before === after) return null;
  if (before === 0) return after >= SLOT_OPEN_MIN_TRAINS ? 'OPENED' : null;
  if (after === 0) return 'CLOSED';
  if (after > before) {
    return after - before >= SLOT_FILL_MIN_RISE && before <= SLOT_FILL_MAX_BEFORE ? 'FILLING' : null;
  }
  return after <= SLOT_SCARCE_MAX_LEFT ? 'DRAINING' : null;
}

/**
 * Les mouvements des suivis.
 *
 * Le compte porte sur **tous** les trains de la fenetre, ouverts ou non :
 * sinon une fenetre vide n'aurait pas de compte, et « elle s'ouvre » ne
 * pourrait litteralement jamais etre observe.
 *
 * Tri : ce qui devient rare d'abord, puis le plus gros mouvement, puis le plus
 * proche. La seule question est « faut-il ouvrir l'application maintenant ? ».
 */
export function watchSignals(
  list: Watchlist,
  previous: Departure[],
  current: Departure[],
): WatchSignal[] {
  const signals: WatchSignal[] = [];

  for (const watch of list) {
    const then = count(previous, watch);
    const now = count(current, watch);
    // Rien dans la fenetre au releve precedent : elle vient d'entrer dans
    // l'horizon de la source. Il n'y a pas de transition a lire.
    if (then.total === 0) continue;

    const kind = verb(then.oui, now.oui);
    if (kind) signals.push({ kind, watch, before: then.oui, after: now.oui });
  }

  const scarce = (signal: WatchSignal) => (signal.after <= SLOT_SCARCE_MAX_LEFT ? 0 : 1);
  const swing = (signal: WatchSignal) => -Math.abs(signal.after - signal.before);

  return signals.sort(
    (a, b) =>
      scarce(a) - scarce(b) || swing(a) - swing(b) || a.watch.from.localeCompare(b.watch.from),
  );
}
