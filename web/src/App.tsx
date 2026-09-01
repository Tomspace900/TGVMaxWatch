import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DIRECTIONS, MAX_RESERVATIONS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useBundle } from './lib/data.ts';
import { buildCalendar, emptyDay } from './lib/model.ts';
import { writeFile } from './lib/github.ts';
import { longDate, reverseDir } from './lib/format.ts';
import { BottomSheet, type SheetAnchor } from './components/BottomSheet.tsx';
import { CalendarGrid } from './components/CalendarGrid.tsx';
import { DayDetail } from './components/DayDetail.tsx';
import { Erosion } from './components/Erosion.tsx';
import { Header } from './components/Header.tsx';
import { Settings } from './components/Settings.tsx';
import { Tonight } from './components/Tonight.tsx';
import type { Reservations, Watchlist } from '../../src/types.ts';
import styles from './App.module.css';

type SheetView = 'day' | 'settings';

export function App() {
  const bundle = useBundle();
  const today = useMemo(() => todayInParis(), []);

  const calendar = useMemo(
    () => buildCalendar(bundle.latest, bundle.history),
    [bundle.latest, bundle.history],
  );

  const [dir, setDir] = useState(() => initialDir());
  /**
   * L'app s'ouvre sur le jour courant, sheet a demi tiree.
   *
   * Le calendrier garde le haut de l'ecran — il reste l'identite du produit —
   * mais la moitie basse porte immediatement la reponse a la question qu'on se
   * pose en ouvrant : qu'est-ce qui part aujourd'hui. C'est aussi ce qui donne
   * son sens a l'ancrage « demi », et ce qui evite un grand vide sous une
   * grille de trente cases qui ne peut pas, geometriquement, remplir l'ecran.
   */
  const [selected, setSelected] = useState<string | null>(today);
  const [peek, setPeek] = useState<string | null>(null);
  const [view, setView] = useState<SheetView>('day');
  const [anchor, setAnchor] = useState<SheetAnchor>('half');

  const thumbRef = useRef<HTMLDivElement>(null);
  const thumbMounted = useRef(false);

  /**
   * Position du curseur de sens, ecrite directement dans le DOM.
   *
   * C'est ce suivi continu — et non la transition de fin — qui fait qu'un
   * changement de sens se sent « natif ». Le faire transiter par un etat React
   * rendrait tout l'ecran, calendrier compris, a chaque frame du glissement.
   */
  const placeThumb = useCallback((progress: number, animate: boolean) => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    thumb.style.transition = animate ? '' : 'none';
    thumb.style.transform = `translate3d(${progress * 100}%, 0, 0)`;
  }, []);

  const dirIndex = Math.max(0, DIRECTIONS.indexOf(dir as (typeof DIRECTIONS)[number]));

  useLayoutEffect(() => {
    // Rien ne s'anime a l'ouverture, seulement les changements ulterieurs.
    placeThumb(dirIndex, thumbMounted.current);
    thumbMounted.current = true;
  }, [dirIndex, placeThumb]);

  // Ecriture optimiste : le fichier distant est la verite, mais l'interface ne
  // doit pas attendre un aller-retour reseau pour repondre au doigt.
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [reservations, setReservations] = useState<Reservations | null>(null);

  const currentWatchlist = watchlist ?? bundle.watchlist;
  const currentReservations = reservations ?? bundle.reservations;

  /**
   * Alternance de sens. Les trajets sont unitaires, pas des allers-retours,
   * mais ils alternent : si le dernier trajet etait Paris -> Bordeaux, le
   * prochain sera l'inverse. L'app s'ouvre sur le sens attendu.
   */
  useEffect(() => {
    if (watchlist || new URLSearchParams(location.search).has('dir')) return;
    const last = bundle.reservations.lastDir;
    if (last) setDir(reverseDir(last));
  }, [bundle.reservations.lastDir, watchlist]);

  // Ouverture depuis une notification : `?date=...&dir=...`.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const date = params.get('date');
    if (!date) return;
    setSelected(date);
    setView('day');
    setAnchor('half');
  }, []);

  const persist = useCallback(async (path: string, value: unknown, message: string) => {
    try {
      await writeFile(path, value, message);
    } catch {
      // Sans jeton, l'edition reste locale a cette session. Le prochain
      // deploiement du site la remplacera par la version du repo.
    }
  }, []);

  const openDay = useCallback((date: string) => {
    setSelected(date);
    setView('day');
    setAnchor('half');
    setPeek(null);
  }, []);

  /**
   * Surveiller un train depuis son balayage.
   *
   * La fenetre est fermee des deux cotes sur l'heure de depart. Avec le seul
   * `after`, l'entree se lisait « previens-moi pour tout train apres 06h06 » et
   * couvrait la journee entiere : un geste sur une ligne doit surveiller cette
   * ligne, pas trente. Les fenetres larges s'ecrivent dans watchlist.json.
   *
   * Le balayage bascule : refaire le geste sur un train deja surveille le
   * retire, sans quoi chaque repetition empilerait un doublon.
   */
  const toggleWatch = useCallback(
    (date: string, depart: string) => {
      const already = currentWatchlist.watch.findIndex(
        (entry) => entry.date === date && entry.dir === dir && entry.after === depart,
      );

      const watch =
        already === -1
          ? [...currentWatchlist.watch, { date, dir, after: depart, before: depart }]
          : currentWatchlist.watch.filter((_, i) => i !== already);

      const next: Watchlist = { ...currentWatchlist, watch };
      setWatchlist(next);
      void persist(
        'watchlist.json',
        next,
        `watchlist: ${already === -1 ? 'surveille' : 'retire'} ${date} ${depart}`,
      );
    },
    [currentWatchlist, dir, persist],
  );

  const unwatch = useCallback(
    (index: number) => {
      const next: Watchlist = {
        ...currentWatchlist,
        watch: currentWatchlist.watch.filter((_, i) => i !== index),
      };
      setWatchlist(next);
      void persist('watchlist.json', next, 'watchlist: retrait');
    },
    [currentWatchlist, persist],
  );

  const book = useCallback(
    (date: string, trainNo: string, depart: string, arrivee: string) => {
      if (currentReservations.slots.length >= MAX_RESERVATIONS) {
        setView('settings');
        setAnchor('full');
        return;
      }

      const next: Reservations = {
        lastDir: dir,
        slots: [
          ...currentReservations.slots,
          { date, dir, trainNo, depart, arrivee, bookedAt: today, confirmed: false },
        ],
      };
      setReservations(next);
      void persist('reservations.json', next, `resa: ${date} ${depart}`);
    },
    [currentReservations, dir, today, persist],
  );

  const release = useCallback(
    (index: number) => {
      const next: Reservations = {
        ...currentReservations,
        slots: currentReservations.slots.filter((_, i) => i !== index),
      };
      setReservations(next);
      void persist('reservations.json', next, 'resa: creneau libere');
    },
    [currentReservations, persist],
  );

  const day = selected ? (calendar.get(selected)?.get(dir) ?? emptyDay(selected, dir)) : null;
  const peeked = peek ? calendar.get(peek)?.get(dir) : null;

  return (
    <div className={styles.app}>
      <Header
        dir={dir}
        thumbRef={thumbRef}
        state={bundle.state}
        onDirChange={setDir}
        onSettings={() => {
          setView('settings');
          setAnchor('full');
        }}
      />

      <CalendarGrid
        calendar={calendar}
        today={today}
        dir={dir}
        selected={selected}
        onDirChange={setDir}
        onDragProgress={placeThumb}
        onSelect={openDay}
        onPeek={setPeek}
      />

      <Erosion stats={bundle.stats} dir={dir} date={selected ?? today} />

      {/* Le contenu s'empile en haut ; le bandeau « dernier moment » reste
          colle au bas de l'ecran, la ou la sheet vient se poser. */}
      <div className={styles.spacer} />

      <Tonight calendar={calendar} today={today} dir={dir} onSelect={openDay} />

      {/* Appui long : apercu sans ouvrir la sheet. */}
      {peeked && (
        <button className={styles.peek} onClick={() => openDay(peeked.date)}>
          <span>{longDate(peeked.date)}</span>
          <span className={styles.peekCount}>
            {peeked.available} / {peeked.trains.length}
          </span>
        </button>
      )}

      <BottomSheet anchor={anchor} onAnchorChange={setAnchor}>
        {view === 'settings' ? (
          <Settings
            state={bundle.state}
            stats={bundle.stats}
            watchlist={currentWatchlist}
            reservations={currentReservations}
            onUnwatch={unwatch}
            onRelease={release}
          />
        ) : (
          day && (
            <DayDetail
              day={day}
              history={bundle.history}
              stats={bundle.stats}
              watchlist={currentWatchlist}
              reservations={currentReservations}
              onWatch={(_trainNo, depart) => toggleWatch(day.date, depart)}
              onBook={(target, trainNo) => {
                const train = target.trains.find((entry) => entry.trainNo === trainNo);
                if (train) book(target.date, trainNo, train.depart, train.arrivee);
              }}
            />
          )
        )}
      </BottomSheet>
    </div>
  );
}

function initialDir(): string {
  const requested = new URLSearchParams(location.search).get('dir');
  return requested && DIRECTIONS.includes(requested as (typeof DIRECTIONS)[number])
    ? requested
    : DIRECTIONS[0];
}
