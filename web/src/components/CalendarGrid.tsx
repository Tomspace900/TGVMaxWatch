import { useMemo, useRef, useState } from 'react';
import { DIRECTIONS } from '../../../src/config.ts';
import { weekday } from '../../../src/dates.ts';
import { availabilityBucket, emptyDay, horizonDates, type Calendar } from '../lib/model.ts';
import { createDragHandler, haptic, nearestAnchor, project } from '../lib/gesture.ts';
import { dayNumber } from '../lib/format.ts';
import styles from './CalendarGrid.module.css';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface Props {
  calendar: Calendar;
  today: string;
  dir: string;
  selected: string | null;
  onDirChange: (dir: string) => void;
  /** Progression du glissement, 0 = premier sens, 1 = second. Suivi 1:1. */
  onDragProgress: (progress: number | null) => void;
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
  const [offset, setOffset] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const width = () => trackRef.current?.clientWidth ?? window.innerWidth * 2;

  const onPointerDown = createDragHandler({
    axis: 'x',
    onMove: ({ dx }) => {
      // Resistance aux extremites : on ne peut pas glisser hors des deux sens.
      const half = width() / 2;
      const raw = dx / half;
      const limited = index + -raw < 0 || index + -raw > 1 ? dx * 0.3 : dx;
      setOffset(limited);
      onDragProgress(Math.min(1, Math.max(0, index - limited / half)));
    },
    onEnd: ({ dx, vx }) => {
      const half = width() / 2;
      const target = nearestAnchor([0, -half], project(dx - index * half, vx));
      const next = DIRECTIONS[target === 0 ? 0 : 1]!;

      setOffset(0);
      onDragProgress(null);
      if (next !== dir) {
        haptic();
        onDirChange(next);
      }
    },
  });

  return (
    <div className={styles.viewport} onPointerDown={onPointerDown}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{
          transform: `translate3d(calc(${-index * 50}% + ${offset}px), 0, 0)`,
          transition: offset === 0 ? `transform var(--normal) var(--ease)` : 'none',
        }}
      >
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
          const bucket = availabilityBucket(day.available);

          return (
            <button
              key={date}
              type="button"
              className={`${styles.cell} ${day.onlyLong ? styles.onlyLong : ''}`}
              data-bucket={bucket}
              data-selected={selected === date}
              onClick={() => onSelect(date)}
              onContextMenu={(event) => {
                // Appui long : apercu rapide, sans ouvrir la sheet.
                event.preventDefault();
                haptic();
                onPeek(date);
              }}
              aria-label={`${date} : ${day.available} trains`}
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
