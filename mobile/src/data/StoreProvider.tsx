import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadJson } from './remote.ts';
import { readReservations, writeReservations } from './local.ts';
import { scheduleStaleAlarm, syncConfirmReminders } from './reminders.ts';
import {
  isPending,
  markPending,
  publishWatchlist,
  resolveWatchlist,
  retrySync,
  subscribeSync,
  syncState,
  type SyncState,
} from './watch-sync.ts';
import { EMPTY_BUNDLE, StoreContext, type Bundle, type Store } from './store.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [watchSync, setWatchSync] = useState<SyncState>(syncState);

  useEffect(() => subscribeSync(setWatchSync), []);

  /**
   * Sept fichiers viennent du depot, les reservations du stockage local.
   *
   * C'est la seule asymetrie de ce chargement, et elle est voulue : le depot
   * porte la donnee publique SNCF et la watchlist que le collecteur doit lire ;
   * l'appareil garde ce qui ne regarde que son proprietaire.
   */
  const refresh = useCallback(async () => {
    // Une edition qui n'a pas atteint le depot repart a chaque tirage : c'est
    // le geste que l'on fait deja quand quelque chose semble ne pas etre passe.
    retrySync();

    const [state, latest, history, stats, trains, remoteWatchlist, pushToken, reservations] =
      await Promise.all([
        loadJson('data/state.json', EMPTY_BUNDLE.state),
        loadJson('data/latest.json', EMPTY_BUNDLE.latest),
        loadJson('data/history.json', EMPTY_BUNDLE.history),
        loadJson('data/stats.json', EMPTY_BUNDLE.stats),
        loadJson('data/trains.json', EMPTY_BUNDLE.trains),
        loadJson('watchlist.json', EMPTY_BUNDLE.watchlist),
        loadJson('data/push-token.json', EMPTY_BUNDLE.pushToken),
        readReservations(),
      ]);

    /*
     * La watchlist ne se prend pas telle quelle dans le lot.
     *
     * Les sept autres fichiers sont de la donnee dont l'appareil n'est pas
     * l'auteur : la derniere version connue est toujours la bonne. La watchlist,
     * elle, s'edite ici — et la lire au CDN puis l'ecraser avec ce qu'il rend
     * etait exactement ce qui faisait revenir un suivi supprime.
     */
    const resolved = await resolveWatchlist({
      value: remoteWatchlist.value,
      fresh: !remoteWatchlist.stale,
    });

    setBundle((current) => ({
      state: state.value,
      latest: latest.value,
      history: history.value,
      stats: stats.value,
      trains: trains.value,
      // Un geste pose pendant que ces lectures revenaient ne doit pas etre
      // efface par leur arrivee. `resolveWatchlist` a deja tranche, mais un
      // geste peut encore etre arrive depuis : la question se repose au moment
      // ou l'etat change vraiment, et c'est le dernier endroit ou elle peut
      // l'etre.
      watchlist: isPending() ? current.watchlist : resolved.watchlist,
      reservations: reservations.reservations,
      pushToken: pushToken.value,
    }));
    setStorageOk(reservations.ok);
    // Le snapshot est la seule ressource dont l'absence se voit vraiment.
    setOffline(latest.stale);
    setLoading(false);

    void syncConfirmReminders(reservations.reservations.slots);
    // Repoussee a chaque collecte fraiche : tant que la donnee arrive, cette
    // alarme ne sonne jamais. Elle ne part que si le collecteur se tait.
    if (!state.stale) void scheduleStaleAlarm(state.value.collectedAt);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * La persistance est un effet du changement d'etat, pas une consequence du
   * geste qui l'a provoque.
   *
   * Ecrire dans le gestionnaire, c'est ecrire une valeur calculee depuis le
   * rendu precedent ; ici on ecrit ce que l'application affiche reellement. Et
   * si la lecture initiale a echoue, on n'ecrit rien du tout : remplacer une
   * liste peut-etre recuperable par une liste vide serait la seule perte
   * irreversible que cette application puisse causer.
   */
  useEffect(() => {
    if (loading || !storageOk) return;
    void writeReservations(bundle.reservations).then((written) => {
      if (!written) setStorageOk(false);
    });
  }, [bundle.reservations, loading, storageOk]);

  /*
   * La publication suit le changement d'etat, elle ne le precede pas.
   *
   * Le message porte aussi le fait qu'il y a quelque chose a publier : un
   * rafraichissement peut lui aussi remplacer la watchlist, et sans ce marqueur
   * l'effet renverrait au depot ce qu'il vient d'en lire.
   */
  const pendingWatch = useRef<string | null>(null);

  useEffect(() => {
    const message = pendingWatch.current;
    if (!message) return;
    pendingWatch.current = null;
    publishWatchlist(bundle.watchlist, message);
  }, [bundle.watchlist]);

  const value = useMemo<Store>(
    () => ({
      bundle,
      loading,
      offline,
      storageOk,
      watchSync,
      retryWatchSync: retrySync,
      refresh,
      // Ecriture optimiste : l'interface ne doit pas attendre un aller-retour
      // reseau pour repondre au doigt. Mais l'optimisme seul ne suffisait pas —
      // entre le geste et l'effet qui publie, un rafraichissement pouvait rendre
      // sa reponse et adopter la version du depot, donc annuler le geste. Le
      // marqueur est desormais pose des le geste, et `resolveWatchlist` le lit.
      setWatchlist: (update: (current: Watchlist) => Watchlist, message: string) => {
        pendingWatch.current = message;
        markPending();
        setBundle((current) => ({ ...current, watchlist: update(current.watchlist) }));
      },
      // L'ecran decrit la transformation, jamais le resultat : c'est ce qui
      // rend impossible d'ecraser un creneau enregistre une fraction de seconde
      // plus tot.
      setReservations: (update: (current: Reservations) => Reservations) => {
        setBundle((current) => ({ ...current, reservations: update(current.reservations) }));
      },
    }),
    [bundle, loading, offline, storageOk, watchSync, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
