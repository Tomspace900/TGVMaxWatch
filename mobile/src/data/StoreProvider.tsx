import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadJson } from './remote.ts';
import { readReservations, readWatchlist, writeReservations, writeWatchlist } from './local.ts';
import { scheduleStaleAlarm, syncConfirmReminders } from './reminders.ts';
import { seedSeen } from './wake.ts';
import { EMPTY_BUNDLE, StoreContext, type Bundle, type Store } from './store.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [watchLoaded, setWatchLoaded] = useState(false);

  /*
   * Le suivi se lit une fois, au demarrage, et n'est plus relu : l'appareil en
   * est le seul auteur. Le relire a chaque tirage pourrait ecraser un geste
   * pose pendant la lecture.
   */
  useEffect(() => {
    void readWatchlist().then(({ watchlist, ok }) => {
      setBundle((current) => ({ ...current, watchlist }));
      if (!ok) setStorageOk(false);
      setWatchLoaded(true);
    });
  }, []);

  /** Six fichiers viennent du depot, les reservations du stockage local. */
  const refresh = useCallback(async () => {
    const [state, latest, history, stats, trains, pushToken, reservations] = await Promise.all([
      loadJson('data/state.json', EMPTY_BUNDLE.state),
      loadJson('data/latest.json', EMPTY_BUNDLE.latest),
      loadJson('data/history.json', EMPTY_BUNDLE.history),
      loadJson('data/stats.json', EMPTY_BUNDLE.stats),
      loadJson('data/trains.json', EMPTY_BUNDLE.trains),
      loadJson('data/push-token.json', EMPTY_BUNDLE.pushToken),
      readReservations(),
    ]);

    setBundle((current) => ({
      ...current,
      state: state.value,
      latest: latest.value,
      history: history.value,
      stats: stats.value,
      trains: trains.value,
      reservations: reservations.reservations,
      pushToken: pushToken.value,
    }));
    if (!reservations.ok) setStorageOk(false);
    if (!latest.stale) void seedSeen(latest.value);
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

  // Meme regle que les reservations, et meme garde.
  useEffect(() => {
    if (!watchLoaded || !storageOk) return;
    void writeWatchlist(bundle.watchlist).then((written) => {
      if (!written) setStorageOk(false);
    });
  }, [bundle.watchlist, watchLoaded, storageOk]);

  const value = useMemo<Store>(
    () => ({
      bundle,
      loading,
      offline,
      storageOk,
      refresh,
      setWatchlist: (update: (current: Watchlist) => Watchlist) => {
        setBundle((current) => ({ ...current, watchlist: update(current.watchlist) }));
      },
      // L'ecran decrit la transformation, jamais le resultat : c'est ce qui
      // rend impossible d'ecraser un creneau enregistre une fraction de seconde
      // plus tot.
      setReservations: (update: (current: Reservations) => Reservations) => {
        setBundle((current) => ({ ...current, reservations: update(current.reservations) }));
      },
    }),
    [bundle, loading, offline, storageOk, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
