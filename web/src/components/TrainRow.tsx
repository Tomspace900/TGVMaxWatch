import { useState } from 'react';
import { createDragHandler, haptic } from '../lib/gesture.ts';
import { formatDuration } from '../lib/format.ts';
import type { Train } from '../lib/model.ts';
import styles from './TrainRow.module.css';

/** Distance a partir de laquelle l'action est validee au relachement. */
const THRESHOLD = 84;

interface Props {
  train: Train;
  watched: boolean;
  booked: boolean;
  onWatch: () => void;
  onBook: () => void;
  onOpen: () => void;
}

export function TrainRow({ train, watched, booked, onWatch, onBook, onOpen }: Props) {
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState(false);

  const onPointerDown = createDragHandler({
    axis: 'x',
    onMove: ({ dx: moved }) => {
      const limited = Math.max(-140, Math.min(140, moved));
      setDx(limited);

      const past = Math.abs(limited) >= THRESHOLD;
      if (past !== armed) {
        setArmed(past);
        haptic();
      }
    },
    onEnd: ({ dx: moved }) => {
      if (Math.abs(moved) >= THRESHOLD) {
        haptic(14);
        if (moved < 0) onWatch();
        else onBook();
      }
      setDx(0);
      setArmed(false);
    },
  });

  const side = dx < 0 ? 'left' : 'right';
  const label = dx < 0 ? 'surveiller' : "j'ai reserve";

  return (
    <div className={styles.wrap}>
      {dx !== 0 && (
        <div className={styles.action} data-side={side} style={{ opacity: armed ? 1 : 0.5 }}>
          {label}
        </div>
      )}

      <button
        type="button"
        className={`${styles.row} ${train.tier === 'long' ? styles.long : ''}`}
        data-available={train.available}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: dx === 0 ? 'transform var(--fast) var(--ease)' : 'none',
        }}
        onPointerDown={onPointerDown}
        onClick={() => dx === 0 && onOpen()}
      >
        <span className={styles.time}>{train.depart}</span>

        <span className={styles.meta}>
          <span>{train.arrivee}</span>
          <span>n{train.trainNo}</span>
          {watched && <span className={styles.watched}>suivi</span>}
          {booked && <span className={styles.tag}>reserve</span>}
        </span>

        <span className={styles.duration}>
          {formatDuration(train.durationMin)}
          {train.tier === 'long' && ' '}
          {train.tier === 'long' && <span className={styles.tag}>long</span>}
        </span>
      </button>
    </div>
  );
}
