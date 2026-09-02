import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SITE_URL } from '../../../src/config.ts';
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

const NATIVE = Capacitor.isNativePlatform();

/**
 * Ou lire les donnees.
 *
 * Sur le web, en relatif : c'est le meme domaine et le service worker fait le
 * cache-first. Dans l'application native, en absolu vers GitHub Pages — les
 * copies empaquetees dans l'APK dateraient du jour du build, et cette
 * application sert precisement a suivre une donnee qui change tous les jours.
 */
const REMOTE = `${SITE_URL}data/`;
const BUNDLED = `${import.meta.env.BASE_URL}data/`;

const CACHE_PREFIX = 'tgvmax.cache.';

/**
 * Cache local, uniquement en natif.
 *
 * Sur le web ce role est tenu par le service worker. En WebView il n'y a plus
 * de service worker, et sans cache l'application s'ouvrirait vide hors ligne —
 * elle doit s'afficher pleine et lisible, y compris dans un train.
 */
function readCache<T>(name: string): T | null {
  if (!NATIVE) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(name: string, value: unknown): void {
  if (!NATIVE) return;
  try {
    localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(value));
  } catch {
    /* Quota depasse ou stockage bloque : on se contente du reseau. */
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Trois niveaux de repli : le reseau fait foi, la copie empaquetee sauve le
 * tout premier lancement hors ligne, et le cache tient l'intervalle.
 */
async function load<T>(name: string, fallback: T): Promise<T> {
  const fresh = await fetchJson<T>((NATIVE ? REMOTE : BUNDLED) + name);
  if (fresh !== null) {
    writeCache(name, fresh);
    return fresh;
  }

  const cached = readCache<T>(name);
  if (cached !== null) return cached;

  if (NATIVE) {
    const bundled = await fetchJson<T>(BUNDLED + name);
    if (bundled !== null) return bundled;
  }

  return fallback;
}

/** Etat initial : le cache, disponible sans le moindre aller-retour. */
function initialBundle(): Bundle {
  if (!NATIVE) return EMPTY;
  return {
    state: readCache<State>('state.json') ?? EMPTY.state,
    latest: readCache<TrainRecord[]>('latest.json') ?? EMPTY.latest,
    history: readCache<History>('history.json') ?? EMPTY.history,
    stats: readCache<Stats>('stats.json'),
    watchlist: readCache<Watchlist>('watchlist.json') ?? EMPTY.watchlist,
    reservations: readCache<Reservations>('reservations.json') ?? EMPTY.reservations,
  };
}

/**
 * Charge les donnees.
 *
 * Il n'y a rien a charger au sens habituel : ce sont des JSON statiques, servis
 * depuis le cache puis revalides en fond. Aucun etat de chargement n'est donc
 * expose, et **aucun spinner n'existe dans ce code** : la seule information
 * d'etat est la date de fraicheur.
 */
export function useBundle(): Bundle {
  const [bundle, setBundle] = useState<Bundle>(initialBundle);

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
