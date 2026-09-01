import { useCallback, useEffect, useRef, useState } from 'react';
import { createDragHandler, haptic, nearestAnchor, project } from '../lib/gesture.ts';
import styles from './BottomSheet.module.css';

export type SheetAnchor = 'closed' | 'half' | 'full';

/** Position de chaque ancrage, en fraction de la hauteur de l'ecran. */
const ANCHOR_OFFSET: Record<SheetAnchor, number> = { closed: 1, half: 0.55, full: 0.08 };
const ORDER: SheetAnchor[] = ['full', 'half', 'closed'];

interface Props {
  anchor: SheetAnchor;
  onAnchorChange: (anchor: SheetAnchor) => void;
  children: React.ReactNode;
}

/**
 * Sheet a points d'ancrage.
 *
 * Toute la navigation du produit vit ici : il n'y a qu'un seul ecran, le
 * calendrier, et le detail comme les reglages se tirent par-dessus. La sheet
 * est interruptible a tout instant — on peut la rattraper en plein vol.
 */
export function BottomSheet({ anchor, onAnchorChange, children }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const crossed = useRef<SheetAnchor | null>(null);

  const height = () => window.innerHeight;
  const resting = ANCHOR_OFFSET[anchor] * height();
  const y = drag === null ? resting : Math.max(ANCHOR_OFFSET.full * height(), resting + drag);

  const onPointerDown = createDragHandler({
    axis: 'y',
    guardEdges: false,
    onMove: ({ dy }) => {
      setDrag(dy);

      // Retour haptique au franchissement de chaque seuil, pas en continu.
      const nearest = closestAnchor(resting + dy, height());
      if (nearest !== crossed.current) {
        crossed.current = nearest;
        haptic();
      }
    },
    onEnd: ({ dy, vy }) => {
      const anchors = ORDER.map((name) => ANCHOR_OFFSET[name] * height());
      const target = nearestAnchor(anchors, project(resting + dy, vy));
      const next = ORDER[anchors.indexOf(target)]!;

      setDrag(null);
      crossed.current = null;
      if (next !== anchor) haptic();
      onAnchorChange(next);
    },
  });

  const close = useCallback(() => onAnchorChange('closed'), [onAnchorChange]);

  useEffect(() => {
    if (anchor === 'closed') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anchor, close]);

  const open = anchor !== 'closed';

  return (
    <>
      <div
        className={styles.scrim}
        onClick={close}
        style={{ opacity: open ? 0.4 : 0, pointerEvents: open ? 'auto' : 'none' }}
        aria-hidden
      />
      <div
        className={styles.sheet}
        style={{
          transform: `translate3d(0, ${y}px, 0)`,
          transition: drag === null ? 'transform var(--normal) var(--ease)' : 'none',
        }}
        role="dialog"
        aria-hidden={!open}
      >
        <div className={styles.grip} onPointerDown={onPointerDown} />
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}

function closestAnchor(position: number, viewport: number): SheetAnchor {
  return ORDER.reduce((best, name) =>
    Math.abs(ANCHOR_OFFSET[name] * viewport - position) <
    Math.abs(ANCHOR_OFFSET[best] * viewport - position)
      ? name
      : best,
  );
}
