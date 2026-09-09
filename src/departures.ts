import { carrierLabel, durationTier, recordDir, recordDuration } from './duration.ts';
import type { Dir, DurationTier, Snapshot } from './types.ts';

/**
 * L'unite de compte du projet : le depart, pas la rame.
 *
 * Le dataset publie les deux rames d'un meme depart comme deux lignes. Pour la
 * source c'est exact — ce sont deux materiels — mais pour qui voyage c'est un
 * seul train : meme minute, meme arrivee, meme transporteur. Les compter deux
 * fois gonflait chaque chiffre de l'application et allongeait la liste d'une
 * journee de vingt-six pour cent, avec deux lignes identiques a la suite qui se
 * lisaient comme un defaut d'affichage.
 *
 * Mesure sur `data/latest.json` : 552 groupes a plusieurs rames, **jamais plus
 * de deux**, **aucune** divergence d'heure d'arrivee, **aucune** divergence de
 * transporteur. Seule l'eligibilite TGVmax differe, dans 53 cas : le depart est
 * alors reservable, mais sur une rame precise — d'ou `openTrainNos`, qui est ce
 * qu'il faut reserver et non ce qui circule.
 *
 * Le repli se fait **a la lecture**, jamais a l'ecriture : `data/snapshots/`
 * garde ce que la source a publie. C'est l'invariant du projet, et une archive
 * repliee ne se deplie pas.
 */
export interface Departure {
  date: string;
  dir: Dir;
  depart: string;
  arrivee: string;
  durationMin: number;
  tier: DurationTier;
  /** Vrai des qu'une rame au moins est ouverte au TGVmax. */
  available: boolean;
  /** Rames de ce depart, dans l'ordre du dataset. Une ou deux. */
  trainNos: string[];
  /** Rames reellement reservables : c'est le numero a saisir chez SNCF. */
  openTrainNos: string[];
  /** `OUIGO`, ou absent : voir `carrierLabel`. */
  carrier?: string;
}

/** Identite d'un depart : une date, un sens, une minute. */
export function departureKey(value: {
  date: string;
  dir: string;
  depart: string;
}): string {
  return `${value.date}|${value.dir}|${value.depart}`;
}

/**
 * Replie un snapshot en departs, tries par date puis par heure.
 *
 * L'ordre est stable pour que deux executions sur la meme archive produisent
 * les memes fichiers derives — sans quoi chaque collecte ferait un diff.
 */
export function foldDepartures(snapshot: Snapshot): Departure[] {
  const byKey = new Map<string, Departure>();

  for (const record of snapshot) {
    const dir = recordDir(record);
    const key = departureKey({ date: record.date, dir, depart: record.heure_depart });
    const open = record.od_happy_card === 'OUI';

    const existing = byKey.get(key);
    if (existing) {
      existing.trainNos.push(record.train_no);
      if (open) {
        existing.openTrainNos.push(record.train_no);
        existing.available = true;
      }
      continue;
    }

    const durationMin = recordDuration(record);
    byKey.set(key, {
      date: record.date,
      dir,
      depart: record.heure_depart,
      arrivee: record.heure_arrivee,
      durationMin,
      tier: durationTier(durationMin),
      available: open,
      trainNos: [record.train_no],
      openTrainNos: open ? [record.train_no] : [],
      ...(carrierLabel(record.entity) ? { carrier: carrierLabel(record.entity)! } : {}),
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.dir.localeCompare(b.dir) ||
      a.depart.localeCompare(b.depart),
  );
}

/** Le numero a retenir quand on enregistre une reservation sur ce depart. */
export function bookableTrainNo(departure: Departure): string {
  return departure.openTrainNos[0] ?? departure.trainNos[0] ?? '';
}
