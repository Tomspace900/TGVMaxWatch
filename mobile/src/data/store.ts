import { createContext, useContext } from 'react';
import type { SyncState } from './watch-sync.ts';
import type {
  History,
  Reservations,
  State,
  PushTokenRecord,
  Stats,
  TrainRecord,
  TrainTrends,
  Watchlist,
} from '../../../src/types.ts';

export interface Bundle {
  state: State;
  latest: TrainRecord[];
  history: History;
  stats: Stats | null;
  /** Disponibilite jour apres jour, train par train. */
  trains: TrainTrends;
  watchlist: Watchlist;
  reservations: Reservations;
  /** Jeton que le collecteur utilisera. Compare a celui de cet appareil. */
  pushToken: PushTokenRecord | null;
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
  trains: { dates: [], series: {} },
  watchlist: { watch: [], rules: [] },
  reservations: { slots: [] },
  pushToken: null,
};

export interface Store {
  bundle: Bundle;
  /** Vrai tant que rien n'est encore arrive, ni du reseau ni du cache. */
  loading: boolean;
  /** Vrai quand tout vient du cache : le reseau n'a pas repondu. */
  offline: boolean;
  /**
   * Faux quand le stockage local des reservations n'a pas pu etre lu ou ecrit.
   * Les ecritures sont alors bloquees : mieux vaut ne rien enregistrer que
   * remplacer une liste peut-etre recuperable par une liste vide.
   */
  storageOk: boolean;
  /**
   * Ou en est la publication du suivi vers le depot.
   *
   * Le suivi s'edite sur l'appareil et se lit par le collecteur : tant qu'il
   * n'est pas publie, l'ecran est juste et les alertes ne le sont pas. C'est
   * exactement le genre d'ecart que ce projet ne laisse pas passer en silence,
   * et il n'existait aucun moyen de le voir — une ecriture ratee etait avalee
   * par un `catch` vide.
   */
  watchSync: SyncState;
  /** Rejoue une publication en echec. Le tirage vers le bas le fait deja. */
  retryWatchSync: () => void;
  refresh: () => Promise<void>;
  /**
   * Prend une fonction, jamais une valeur, pour la meme raison que
   * `setReservations` — et l'ecriture dans le depot part d'ici, pas des ecrans.
   * Trois ecrans modifient desormais le suivi ; qu'ils sachent chacun
   * comment la persister etait une regle de plus a tenir a jour a trois
   * endroits.
   */
  setWatchlist: (update: (current: Watchlist) => Watchlist, message: string) => void;
  /**
   * Prend une fonction, jamais une valeur.
   *
   * Une valeur calculee depuis le `bundle` d'un ecran est une valeur calculee
   * depuis l'etat d'avant le dernier rendu : deux gestes rapproches et le
   * second effacait le premier.
   */
  setReservations: (update: (current: Reservations) => Reservations) => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore hors du fournisseur');
  return store;
}
