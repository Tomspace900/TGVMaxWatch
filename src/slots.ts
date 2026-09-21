import {
  DECISION_HORIZON_DAYS,
  SLOT_FILL_MAX_BEFORE,
  SLOT_FILL_MIN_RISE,
  SLOT_OPEN_MIN_TRAINS,
  SLOT_SCARCE_MAX_LEFT,
} from './config.ts';
import { daysBetween, weekdayKey } from './dates.ts';
import type { Departure } from './departures.ts';
import { periodOf } from './periods.ts';
import { withinWindow } from './watchlist.ts';
import type { SlotSignal, TrainEvent, Watchlist } from './types.ts';

/**
 * Ce qui bouge sur les creneaux qu'on suit.
 *
 * Les deux alertes generales — une date rouvre, une date se vide — portent sur
 * le compte d'une (date, sens) entiere et ne consultent aucune preference.
 * Elles ont ete separees de la watchlist volontairement : une regle taillee
 * pour amortir le bruit des ouvertures de train reduisait au silence, six jours
 * sur sept, un signal qui n'en produit qu'un par jour.
 *
 * Ce module est le pont entre les deux, et il ne franchit la separation que
 * dans un sens : il n'applique la dynamique d'une date qu'aux **fenetres
 * explicitement suivies**, sans jamais toucher aux alertes universelles.
 *
 * Il reste pur — aucun `node:`, aucune dependance — pour que l'application
 * puisse le lire si elle en a besoin.
 */

/** Une fenetre suivie sur une date et un sens donnes. */
export interface WatchedSlot {
  date: string;
  dir: string;
  after?: string;
  before?: string;
  label: string;
  /**
   * Vrai quand une entree **datee** designe cette fenetre.
   *
   * C'est ce qui la sort de l'horizon de decision : poser un suivi sur une date
   * precise est une intention, et personne ne suit le 15/10 par accident. Une
   * regle recurrente, elle, ratisse cinq jeudis d'un coup et n'en designe aucun
   * — c'est elle qui produisait les « jeu 15/10 matin s'ouvre » a J+28.
   */
  explicit: boolean;
}

function slotKey(slot: { date: string; dir: string; after?: string; before?: string }): string {
  return `${slot.date}|${slot.dir}|${slot.after ?? ''}|${slot.before ?? ''}`;
}

/** `matin`, `toute la journee`, ou les bornes brutes d'une fenetre inconnue. */
function windowLabel(after?: string, before?: string): string {
  const period = periodOf(after, before);
  if (period) return period.label;
  if (!after && !before) return 'toute la journée';
  return `${after ?? '…'}–${before ?? '…'}`;
}

/**
 * Les fenetres suivies qui trouvent une date dans le snapshot.
 *
 * Une entree posee sur une minute (`after === before`) designe un train : elle
 * est deja couverte, a la bonne maille, par un evenement de train. Ne restent
 * ici que les creneaux — une periode, ou une journee entiere.
 */
export function watchedSlots(
  watchlist: Watchlist,
  departures: Departure[],
  today: string,
): WatchedSlot[] {
  const pairs = new Set<string>();
  for (const departure of departures) {
    if (departure.date < today) continue;
    pairs.add(`${departure.date}|${departure.dir}`);
  }

  const slots = new Map<string, WatchedSlot>();

  const add = (
    date: string,
    dir: string,
    explicit: boolean,
    after?: string,
    before?: string,
  ) => {
    if (after !== undefined && after === before) return;
    const slot: WatchedSlot = {
      date,
      dir,
      ...(after ? { after } : {}),
      ...(before ? { before } : {}),
      label: windowLabel(after, before),
      explicit,
    };
    const key = slotKey(slot);
    // Une meme fenetre decrite par une entree datee **et** par une regle reste
    // une intention : c'est la plus forte des deux origines qui compte.
    const known = slots.get(key);
    if (known?.explicit) return;
    slots.set(key, slot);
  };

  for (const pair of pairs) {
    const [date = '', dir = ''] = pair.split('|');

    for (const entry of watchlist.watch) {
      if (entry.date !== date) continue;
      if (entry.dir && entry.dir !== dir) continue;
      add(date, dir, true, entry.after, entry.before);
    }

    for (const rule of watchlist.rules) {
      if (rule.weekday !== weekdayKey(date)) continue;
      if (rule.dir && rule.dir !== dir) continue;
      add(date, dir, false, rule.after, rule.before);
    }
  }

  return [...slots.values()];
}

/** Departs d'un creneau : ouverts, et total qui circule. */
function countSlot(departures: Departure[], slot: WatchedSlot): { oui: number; total: number } {
  let oui = 0;
  let total = 0;

  for (const departure of departures) {
    if (departure.date !== slot.date) continue;
    if (departure.dir !== slot.dir) continue;
    if (!withinWindow(slot, departure.depart)) continue;
    total++;
    if (departure.available) oui++;
  }

  return { oui, total };
}

/**
 * Le verbe que merite un mouvement de creneau, ou rien.
 *
 * Quatre etats decident, et les deux qui manquaient sont ceux qu'on attendait.
 * L'ancienne regle de fonte exigeait une baisse d'au moins deux **et** deux
 * restants au plus : `2 -> 1` a deux jours du depart, qui est exactement la
 * nouvelle qu'on veut, ne passait pas. C'est donc la rarete qui decide seule
 * d'une baisse.
 *
 * Et une hausse ne se dit que lorsqu'elle **sort** de la rarete : `1 -> 7` est
 * une nouvelle, `5 -> 9` n'en est pas une — on avait deja de quoi choisir, et
 * une ligne de plus dans un message qu'on balaie coute plus qu'elle ne rapporte.
 */
function slotVerb(before: number, after: number): SlotSignal['kind'] | null {
  if (before === after) return null;
  if (before === 0) return after >= SLOT_OPEN_MIN_TRAINS ? 'SLOT_OPENED' : null;
  if (after === 0) return 'SLOT_CLOSED';
  if (after > before) {
    return after - before >= SLOT_FILL_MIN_RISE && before <= SLOT_FILL_MAX_BEFORE
      ? 'SLOT_FILLING'
      : null;
  }
  return after <= SLOT_SCARCE_MAX_LEFT ? 'SLOT_DRAINING' : null;
}

/**
 * Les mouvements des creneaux suivis, entre deux snapshots.
 *
 * Le compte porte sur **tous** les trains de la fenetre, ouverts ou non. C'est
 * la condition pour qu'un creneau vide existe : en ne comptant que les ouverts,
 * un creneau a zero n'aurait pas de cle, et « il s'ouvre » ne pourrait
 * litteralement jamais se produire — l'erreur exacte que ce projet a deja faite
 * a l'echelle de la date.
 *
 * Une fenetre venue d'une regle recurrente s'arrete a l'horizon de decision.
 * Mesure : six des neuf ouvertures de creneau de l'archive portaient sur J+14 a
 * J+30, c'est-a-dire sur le jeudi d'apres le jeudi d'apres — une date qu'aucune
 * intention ne designait et sur laquelle il n'y a rien a decider. Une fenetre
 * posee sur une date precise, elle, passe toujours : c'est une intention.
 */
export function slotSignals(
  watchlist: Watchlist,
  previous: Departure[],
  current: Departure[],
  today: string,
): SlotSignal[] {
  const signals: SlotSignal[] = [];

  for (const slot of watchedSlots(watchlist, current, today)) {
    if (!slot.explicit && daysBetween(today, slot.date) > DECISION_HORIZON_DAYS) continue;

    const now = countSlot(current, slot);
    const then = countSlot(previous, slot);

    // Aucun train dans la fenetre au snapshot precedent : la date vient
    // d'entrer dans l'horizon, ou le creneau n'existe pas ce jour-la. Il n'y a
    // pas de transition a lire.
    if (then.total === 0) continue;

    const kind = slotVerb(then.oui, now.oui);
    if (!kind) continue;

    const { explicit: _origin, ...window } = slot;
    signals.push({ kind, ...window, before_count: then.oui, after_count: now.oui });
  }

  /*
   * La rarete passe devant l'ampleur, et l'ampleur devant la date.
   *
   * Le tri d'avant mettait les ouvertures devant les fontes, ce qui revenait a
   * dire qu'une bonne nouvelle decide plus qu'une mauvaise. C'est faux ici :
   * la seule question est « faut-il ouvrir l'application maintenant ? », et il
   * reste deux trains y repond mieux que il y en a huit. A rarete egale, c'est
   * le plus gros mouvement qui decide — `1 -> 7` avant `2 -> 3`.
   */
  const scarce = (signal: SlotSignal) => (signal.after_count <= SLOT_SCARCE_MAX_LEFT ? 0 : 1);
  const swing = (signal: SlotSignal) => -Math.abs(signal.after_count - signal.before_count);

  return signals.sort(
    (a, b) =>
      scarce(a) - scarce(b) ||
      swing(a) - swing(b) ||
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir) ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Vrai quand un signal de creneau dit deja ce que cet evenement dirait.
 *
 * Sans ce filtre, un creneau qui s'ouvre avec trois trains produirait quatre
 * lignes : « le matin s'ouvre » suivi des trois horaires. La maille du message
 * doit suivre la maille du suivi — on a demande a suivre un creneau, on est
 * prevenu pour un creneau.
 */
export function isCoveredBySlot(signals: SlotSignal[], event: TrainEvent): boolean {
  return signals.some(
    (signal) =>
      signal.date === event.date &&
      signal.dir === event.dir &&
      withinWindow(signal, event.depart),
  );
}
