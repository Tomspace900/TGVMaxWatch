import { useCallback, useRef, useState } from 'react';
import { createDragHandler, haptic } from '../lib/gesture.ts';
import { formatDuration } from '../lib/format.ts';
import type { Train } from '../lib/model.ts';
import styles from './TrainRow.module.css';

/** Distance a partir de laquelle l'action est validee au relachement. */
const THRESHOLD = 84;
const MAX_TRAVEL = 140;

interface Props {
  train: Train;
  watched: boolean;
  booked: boolean;
  onWatch: () => void;
  onBook: () => void;
}

export function TrainRow({ train, watched, booked, onWatch, onBook }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const armed = useRef(false);

  // `side` ne change qu'au changement de direction du geste, pas a chaque
  // frame : c'est le seul etat React de la ligne.
  const [side, setSide] = useState<'left' | 'right' | null>(null);

  const place = useCallback((dx: number, animate: boolean) => {
    const row = rowRef.current;
    const action = actionRef.current;
    if (!row) return;

    row.style.transition = animate ? '' : 'none';
    row.style.transform = `translate3d(${dx}px, 0, 0)`;

    // L'action se revele progressivement sous le doigt, et se confirme au
    // franchissement du seuil.
    if (action) {
      action.style.opacity = String(Math.min(1, Math.abs(dx) / THRESHOLD) * 0.6 + (armed.current ? 0.4 : 0));
    }
  }, []);

  const onPointerDown = createDragHandler({
    axis: 'x',
    onMove: ({ dx }) => {
      const offset = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, dx));
      const next = offset < 0 ? 'left' : 'right';
      setSide((current) => (current === next ? current : next));

      const past = Math.abs(offset) >= THRESHOLD;
      if (past !== armed.current) {
        armed.current = past;
        haptic();
      }
      place(offset, false);
    },
    onEnd: ({ dx }) => {
      if (Math.abs(dx) >= THRESHOLD) {
        haptic(14);
        if (dx < 0) onWatch();
        else onBook();
      }
      armed.current = false;
      place(0, true);
      setSide(null);
    },
  });

  return (
    <div className={styles.wrap} onPointerDown={onPointerDown}>
      {side && (
        <div ref={actionRef} className={styles.action} data-side={side}>
          {side === 'left' ? 'surveiller' : "j'ai reserve"}
        </div>
      )}

      <div
        ref={rowRef}
        className={`${styles.row} ${train.tier === 'long' ? styles.long : ''}`}
        data-available={train.available}
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
          {train.tier === 'long' && <span className={styles.tag}>long</span>}
        </span>
      </div>
    </div>
  );
}
