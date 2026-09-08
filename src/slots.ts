import {
  SLOT_DRAIN_MAX_LEFT,
  SLOT_DRAIN_MIN_DROP,
  SLOT_OPEN_MIN_TRAINS,
} from './config.ts';
import { weekdayKey } from './dates.ts';
import { recordDir } from './duration.ts';
import { periodOf } from './periods.ts';
import { withinWindow } from './watchlist.ts';
import type { Snapshot, SlotSignal, TrainEvent, Watchlist } from './types.ts';

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
  snapshot: Snapshot,
  today: string,
): WatchedSlot[] {
  const pairs = new Set<string>();
  for (const record of snapshot) {
    if (record.date < today) continue;
    pairs.add(`${record.date}|${recordDir(record)}`);
  }

  const slots = new Map<string, WatchedSlot>();

  const add = (date: string, dir: string, after?: string, before?: string) => {
    if (after !== undefined && after === before) return;
    const slot: WatchedSlot = {
      date,
      dir,
      ...(after ? { after } : {}),
      ...(before ? { before } : {}),
      label: windowLabel(after, before),
    };
    slots.set(slotKey(slot), slot);
  };

  for (const pair of pairs) {
    const [date = '', dir = ''] = pair.split('|');

    for (const entry of watchlist.watch) {
      if (entry.date !== date) continue;
      if (entry.dir && entry.dir !== dir) continue;
      add(date, dir, entry.after, entry.before);
    }

    for (const rule of watchlist.rules) {
      if (rule.weekday !== weekdayKey(date)) continue;
      if (rule.dir && rule.dir !== dir) continue;
      add(date, dir, rule.after, rule.before);
    }
  }

  return [...slots.values()];
}

/** Trains d'un creneau : ouverts, et total qui circule. */
function countSlot(snapshot: Snapshot, slot: WatchedSlot): { oui: number; total: number } {
  let oui = 0;
  let total = 0;

  for (const record of snapshot) {
    if (record.date !== slot.date) continue;
    if (recordDir(record) !== slot.dir) continue;
    if (!withinWindow(slot, record.heure_depart)) continue;
    total++;
    if (record.od_happy_card === 'OUI') oui++;
  }

  return { oui, total };
}

/**
 * Les mouvements des creneaux suivis, entre deux snapshots.
 *
 * Le compte porte sur **tous** les trains de la fenetre, ouverts ou non. C'est
 * la condition pour qu'un creneau vide existe : en ne comptant que les ouverts,
 * un creneau a zero n'aurait pas de cle, et « il s'ouvre » ne pourrait
 * litteralement jamais se produire — l'erreur exacte que ce projet a deja faite
 * a l'echelle de la date.
 */
export function slotSignals(
  watchlist: Watchlist,
  previous: Snapshot,
  current: Snapshot,
  today: string,
): SlotSignal[] {
  const signals: SlotSignal[] = [];

  for (const slot of watchedSlots(watchlist, current, today)) {
    const now = countSlot(current, slot);
    const then = countSlot(previous, slot);

    // Aucun train dans la fenetre au snapshot precedent : la date vient
    // d'entrer dans l'horizon, ou le creneau n'existe pas ce jour-la. Il n'y a
    // pas de transition a lire.
    if (then.total === 0) continue;

    if (then.oui === 0 && now.oui >= SLOT_OPEN_MIN_TRAINS) {
      signals.push({ kind: 'SLOT_OPENED', ...slot, before_count: then.oui, after_count: now.oui });
    } else if (
      now.oui > 0 &&
      then.oui - now.oui >= SLOT_DRAIN_MIN_DROP &&
      now.oui <= SLOT_DRAIN_MAX_LEFT
    ) {
      signals.push({ kind: 'SLOT_DRAINING', ...slot, before_count: then.oui, after_count: now.oui });
    }
  }

  // Une ouverture passe avant une fonte : l'une ouvre une possibilite, l'autre
  // la ferme, et c'est la premiere qu'on veut lire en haut du message.
  const rank = (kind: SlotSignal['kind']) => (kind === 'SLOT_OPENED' ? 0 : 1);

  return signals.sort(
    (a, b) =>
      rank(a.kind) - rank(b.kind) ||
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
