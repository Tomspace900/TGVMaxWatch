import { useEffect, useState } from 'react';
import type {
  History,
  Reservations,
  State,
  Stats,
  TrainRecord,
  Watchlist,
} from '../../../src/types.ts';

export interface Bundle {
  state: State;
  latest: TrainRecord[];
  history: History;
  stats: Stats | null;
  watchlist: Watchlist;
  reservations: Reservations;
}

const EMPTY: Bundle = {
  state: {
    dataProcessed: null,
    collectedAt: null,
    lastPushOk: null,
    latestSnapshot: null,
    snapshotCount: 0,
    recordCount: 0,
  },
  latest: [],
  history: {},
  stats: null,
  watchlist: { watch: [], rules: [] },
  reservations: { lastDir: null, slots: [] },
};

async function load<T>(name: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Charge les donnees du site.
 *
 * Il n'y a rien a charger au sens habituel : ce sont des JSON statiques mis en
 * cache par le service worker, servis instantanement puis revalides en fond.
 * Aucun etat de chargement n'est donc expose, et **aucun spinner n'existe dans
 * ce code** : la seule information d'etat est la date de fraicheur.
 */
export function useBundle(): Bundle {
  const [bundle, setBundle] = useState<Bundle>(EMPTY);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const [state, latest, history, stats, watchlist, reservations] = await Promise.all([
        load('state.json', EMPTY.state),
        load('latest.json', EMPTY.latest),
        load('history.json', EMPTY.history),
        load<Stats | null>('stats.json', null),
        load('watchlist.json', EMPTY.watchlist),
        load('reservations.json', EMPTY.reservations),
      ]);

      if (alive) setBundle({ state, latest, history, stats, watchlist, reservations });
    })();

    return () => {
      alive = false;
    };
  }, []);

  return bundle;
}
