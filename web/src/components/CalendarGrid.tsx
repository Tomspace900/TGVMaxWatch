import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { DIRECTIONS } from '../../../src/config.ts';
import { weekday } from '../../../src/dates.ts';
import { availabilityBucket, emptyDay, horizonDates, type Calendar } from '../lib/model.ts';
import { createDragHandler, haptic, nearestAnchor, project } from '../lib/gesture.ts';
import { dayNumber, dirLabel, longDate } from '../lib/format.ts';
import styles from './CalendarGrid.module.css';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface Props {
  calendar: Calendar;
  today: string;
  dir: string;
  selected: string | null;
  onDirChange: (dir: string) => void;
  /**
   * Position du curseur de sens, 0 = premier sens, 1 = second. `animate` est
   * faux pendant le glissement, ou le curseur doit coller au doigt.
   */
  onDragProgress: (progress: number, animate: boolean) => void;
  onSelect: (date: string) => void;
  onPeek: (date: string | null) => void;
}

export function CalendarGrid({
  calendar,
  today,
  dir,
  selected,
  onDirChange,
  onDragProgress,
  onSelect,
  onPeek,
}: Props) {
  const dates = useMemo(() => horizonDates(today), [today]);
  const index = Math.max(0, DIRECTIONS.indexOf(dir as (typeof DIRECTIONS)[number]));

  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const mounted = useRef(false);

  /**
   * Ecrit la position directement dans le DOM.
   *
   * Passer par un etat React a chaque frame reconstruirait les 62 cases du
   * carrousel soixante fois par seconde : c'est ce qui rendait le glissement
   * pateux la ou il doit coller au doigt.
   */
  const place = useCallback((offset: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translate3d(calc(${-indexRef.current * 50}% + ${offset}px), 0, 0)`;
  }, []);

  useLayoutEffect(() => {
    indexRef.current = index;
    // Rien ne s'anime a l'ouverture, seulement les changements ulterieurs.
    place(0, mounted.current);
    mounted.current = true;
  }, [index, place]);

  const panelWidth = () => (trackRef.current?.clientWidth ?? window.innerWidth * 2) / 2;

  const onPointerDown = createDragHandler({
    axis: 'x',
    onMove: ({ dx }) => {
      const half = panelWidth();
      // Resistance aux extremites : il n'y a que deux sens, on ne glisse pas
      // au-dela.
      const wanted = index - dx / half;
      const offset = wanted < 0 || wanted > 1 ? dx * 0.3 : dx;

      place(offset, false);
      onDragProgress(Math.min(1, Math.max(0, index - offset / half)), false);
    },
    onEnd: ({ dx, vx }) => {
      const half = panelWidth();
      const target = nearestAnchor([0, -half], project(-index * half + dx, vx));
      const nextIndex = target === 0 ? 0 : 1;
      const next = DIRECTIONS[nextIndex]!;

      onDragProgress(nextIndex, true);

      if (next === dir) {
        place(0, true);
        return;
      }
      haptic();
      onDirChange(next); // le useLayoutEffect repositionne, avec animation
    },
  });

  return (
    <div className={styles.viewport} onPointerDown={onPointerDown}>
      <div ref={trackRef} className={styles.track}>
        {DIRECTIONS.map((panelDir) => (
          <Panel
            key={panelDir}
            dates={dates}
            today={today}
            dir={panelDir}
            calendar={calendar}
            selected={selected}
            onSelect={onSelect}
            onPeek={onPeek}
          />
        ))}
      </div>
    </div>
  );
}

interface PanelProps {
  dates: string[];
  today: string;
  dir: string;
  calendar: Calendar;
  selected: string | null;
  onSelect: (date: string) => void;
  onPeek: (date: string | null) => void;
}

function Panel({ dates, today, dir, calendar, selected, onSelect, onPeek }: PanelProps) {
  // Aligne la grille sur les jours de la semaine : « les vendredis soir » est
  // le raisonnement reel de l'utilisateur, il doit se lire en colonne.
  const lead = (weekday(dates[0]!) + 6) % 7;

  return (
    <div className={styles.panel}>
      <div className={styles.weekdays} aria-hidden>
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className={styles.weekday}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.grid} role="grid">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`blank-${i}`} className={styles.blank} />
        ))}

        {dates.map((date) => {
          const day = calendar.get(date)?.get(dir) ?? emptyDay(date, dir);

          return (
            <button
              key={date}
              type="button"
              className={`${styles.cell} ${day.onlyLong ? styles.onlyLong : ''}`}
              data-bucket={availabilityBucket(day.available)}
              data-selected={selected === date}
              data-date={date}
              data-dir={dir}
              onClick={() => onSelect(date)}
              onContextMenu={(event) => {
                // Appui long : apercu rapide, sans ouvrir la sheet.
                event.preventDefault();
                haptic();
                onPeek(date);
              }}
              // Le sens fait partie de l'identite de la case : sans lui, deux
              // journees de sens opposes portent la meme etiquette.
              aria-label={`${longDate(date)}, ${dirLabel(dir)} : ${day.available} trains`}
            >
              <span className={`${styles.day} ${date === today ? styles.today : ''}`}>
                {dayNumber(date)}
              </span>
              <span className={styles.count}>{day.available}</span>
              {day.delta !== null && day.delta !== 0 && (
                <span className={styles.delta}>
                  {day.delta > 0 ? `+${day.delta}` : day.delta}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
