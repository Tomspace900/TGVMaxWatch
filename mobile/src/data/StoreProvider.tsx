import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadJson } from './remote.ts';
import { readReservations, writeReservations } from './local.ts';
import { scheduleStaleAlarm, syncConfirmReminders } from './reminders.ts';
import { EMPTY_BUNDLE, StoreContext, type Bundle, type Store } from './store.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  /**
   * Sept fichiers viennent du depot, les reservations du stockage local.
   *
   * C'est la seule asymetrie de ce chargement, et elle est voulue : le depot
   * porte la donnee publique SNCF et la watchlist que le collecteur doit lire ;
   * l'appareil garde ce qui ne regarde que son proprietaire.
   */
  const refresh = useCallback(async () => {
    const [state, latest, history, stats, trains, watchlist, pushToken, reservations] =
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

    setBundle({
      state: state.value,
      latest: latest.value,
      history: history.value,
      stats: stats.value,
      trains: trains.value,
      watchlist: watchlist.value,
      reservations,
      pushToken: pushToken.value,
    });
    // Le snapshot est la seule ressource dont l'absence se voit vraiment.
    setOffline(latest.stale);
    setLoading(false);

    void syncConfirmReminders(reservations.slots);
    // Repoussee a chaque collecte fraiche : tant que la donnee arrive, cette
    // alarme ne sonne jamais. Elle ne part que si le collecteur se tait.
    if (!state.stale) void scheduleStaleAlarm(state.value.collectedAt);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<Store>(
    () => ({
      bundle,
      loading,
      offline,
      refresh,
      // Ecriture optimiste : le depot fait foi, mais l'interface ne doit pas
      // attendre un aller-retour reseau pour repondre au doigt.
      setWatchlist: (watchlist: Watchlist) =>
        setBundle((current) => ({ ...current, watchlist })),
      // Les reservations ne transitant plus par le depot, le store porte leur
      // persistance : aucun ecran n'a plus a y penser, ni a gerer de conflit.
      setReservations: (reservations: Reservations) => {
        setBundle((current) => ({ ...current, reservations }));
        void writeReservations(reservations);
      },
    }),
    [bundle, loading, offline, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
