import { DRAIN_MAX_LEFT, DRAIN_MIN_DROP, REOPEN_MIN_TRAINS } from './config.ts';
import { departureKey, type Departure } from './departures.ts';
import { countSnapshot } from './history.ts';
import { slotSignals } from './slots.ts';
import type { DateSignal, DiffResult, TrainEvent, Watchlist } from './types.ts';

/**
 * Compare deux snapshots consecutifs.
 *
 * Deux mailles differentes, et c'est voulu. Les evenements portent sur un
 * depart — dont un que la source ne donne pas : un depart qui disparait du
 * dataset n'est pas complet, il est supprime (travaux, greve, changement de
 * service), et confondre les deux fait croire a une saturation. Les signaux,
 * eux, portent sur le compte d'une (date, sens), la maille a laquelle on decide
 * de partir.
 *
 * Les deux comptent des **departs**, jamais des rames : une rame qui s'ouvre
 * alors que l'autre du meme depart l'etait deja ne change rien pour qui voyage,
 * et l'annoncer serait une fausse alerte — 53 departs par snapshot sont dans ce
 * cas.
 *
 * Une troisieme maille s'y ajoute, mais seulement pour qui la demande : les
 * creneaux explicitement suivis, dans `slots.ts`. Les deux premieres ne
 * consultent aucune preference et ne doivent jamais commencer a le faire.
 *
 * Ce module reste hors du graphe d'imports de `mobile/` : il tire `history.ts`,
 * donc `storage.ts`, donc `node:`. Le bundle Metro de `ci.yml` le verifie.
 */
export function diffSnapshots(
  previous: Departure[],
  current: Departure[],
  today: string,
  watchlist: Watchlist = { watch: [], rules: [] },
): DiffResult {
  const before = index(previous);
  const after = index(current);

  const events: TrainEvent[] = [];

  for (const [key, departure] of after) {
    const old = before.get(key);

    if (!old) {
      // Une cle inconnue sur une date deja suivie est un depart ajoute au plan
      // de transport. On ne la signale que s'il est effectivement reservable.
      if (departure.available) events.push(toEvent('OPEN', departure));
      continue;
    }

    if (!old.available && departure.available) {
      events.push(toEvent('OPEN', departure));
    } else if (old.available && !departure.available) {
      events.push(toEvent('CLOSE', departure));
    }
  }

  for (const [key, departure] of before) {
    if (!after.has(key)) events.push(toEvent('REMOVED', departure));
  }

  return {
    events: sortEvents(events),
    signals: findSignals(previous, current, today),
    slots: slotSignals(watchlist, previous, current, today),
  };
}

/**
 * Les deux mouvements qui meritent de deranger, sans consulter de preference.
 *
 * Le plan du projet pariait sur l'entree d'une date a J+30, « le signal a plus
 * fort rendement », suppose apporter dix a quinze trains d'un coup. L'archive
 * dit le contraire : les quatre dates mesurees sont entrees a **zero place**
 * (0/35, 0/39, 0/33, 0/29) et se sont remplies le lendemain. L'alerte batie sur
 * l'entree exigeait `oui > 0` a l'entree : elle ne pouvait litteralement jamais
 * partir.
 *
 * C'est donc la transition qu'on regarde, pas l'entree — ce qui capte au
 * passage la remontee des dates proches, ou les places liberees la veille
 * reapparaissent en nombre : le 06/09 Paris > Bordeaux est passe de 1 a 17 en
 * une journee, a trois jours du depart.
 */
function findSignals(previous: Departure[], current: Departure[], today: string): DateSignal[] {
  const before = countAvailable(previous);
  const after = countAvailable(current);
  const signals: DateSignal[] = [];

  for (const [key, now] of after) {
    // Une cle absente du snapshot precedent est une date qui vient d'entrer
    // dans la fenetre. Elle entre a zero : il n'y a rien a annoncer avant que
    // ses places n'arrivent, ce qui se verra au diff suivant.
    const then = before.get(key);
    if (then === undefined) continue;

    const [date = '', dir = ''] = key.split('|');
    // Un train de ce matin n'interesse plus personne ce soir.
    if (date < today) continue;

    if (then === 0 && now >= REOPEN_MIN_TRAINS) {
      signals.push({ kind: 'REOPENED', date, dir, before: then, after: now });
    } else if (then - now >= DRAIN_MIN_DROP && now <= DRAIN_MAX_LEFT) {
      signals.push({ kind: 'DRAINING', date, dir, before: then, after: now });
    }
  }

  // Une reouverture passe avant une fonte : l'une ouvre une possibilite,
  // l'autre la ferme, et c'est la premiere qu'on veut lire en haut du message.
  const rank = (kind: DateSignal['kind']) => (kind === 'REOPENED' ? 0 : 1);

  return signals.sort(
    (a, b) =>
      rank(a.kind) - rank(b.kind) ||
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir),
  );
}

/** `<date>|<sens>` -> nombre de departs eligibles. */
function countAvailable(departures: Departure[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [date, byDir] of countSnapshot(departures)) {
    for (const [dir, observation] of byDir) counts.set(`${date}|${dir}`, observation.oui);
  }
  return counts;
}

function index(departures: Departure[]): Map<string, Departure> {
  return new Map(departures.map((departure) => [departureKey(departure), departure]));
}

function toEvent(kind: TrainEvent['kind'], departure: Departure): TrainEvent {
  return {
    kind,
    date: departure.date,
    dir: departure.dir,
    trainNos: departure.trainNos,
    depart: departure.depart,
    arrivee: departure.arrivee,
    durationMin: departure.durationMin,
    tier: departure.tier,
  };
}

function sortEvents(events: TrainEvent[]): TrainEvent[] {
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir) ||
      a.depart.localeCompare(b.depart),
  );
}
