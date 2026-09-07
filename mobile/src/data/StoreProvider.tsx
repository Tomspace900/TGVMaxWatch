import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { writeFile } from './github.ts';
import { loadJson } from './remote.ts';
import { readReservations, writeReservations } from './local.ts';
import { scheduleStaleAlarm, syncConfirmReminders } from './reminders.ts';
import { EMPTY_BUNDLE, StoreContext, type Bundle, type Store } from './store.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

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
      reservations: reservations.reservations,
      pushToken: pushToken.value,
    });
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
   * L'ecriture dans le depot suit le changement d'etat, elle ne le precede pas.
   *
   * Le message porte aussi le fait qu'il y a quelque chose a ecrire : un
   * rafraichissement remplace la watchlist par celle du depot, et sans ce
   * marqueur l'effet renverrait aussitot au depot ce qu'il vient d'en lire.
   */
  const pendingWatch = useRef<string | null>(null);

  useEffect(() => {
    const message = pendingWatch.current;
    if (!message) return;
    pendingWatch.current = null;
    void writeFile('watchlist.json', bundle.watchlist, message).catch(() => {
      // Sans jeton, l'edition reste locale a cette session ; le prochain
      // rafraichissement la remplacera par la version du depot.
    });
  }, [bundle.watchlist]);

  const value = useMemo<Store>(
    () => ({
      bundle,
      loading,
      offline,
      storageOk,
      refresh,
      // Ecriture optimiste : le depot fait foi, mais l'interface ne doit pas
      // attendre un aller-retour reseau pour repondre au doigt.
      setWatchlist: (update: (current: Watchlist) => Watchlist, message: string) => {
        pendingWatch.current = message;
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
