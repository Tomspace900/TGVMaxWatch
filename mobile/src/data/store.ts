import { createContext, useContext } from 'react';
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

export const EMPTY_BUNDLE: Bundle = {
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

export interface Store {
  bundle: Bundle;
  /** Vrai tant que rien n'est encore arrive, ni du reseau ni du cache. */
  loading: boolean;
  /** Vrai quand tout vient du cache : le reseau n'a pas repondu. */
  offline: boolean;
  refresh: () => Promise<void>;
  setWatchlist: (watchlist: Watchlist) => void;
  setReservations: (reservations: Reservations) => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore hors du fournisseur');
  return store;
}
