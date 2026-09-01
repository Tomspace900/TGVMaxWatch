import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const crossed = useRef<SheetAnchor | null>(null);

  const height = () => sheetRef.current?.offsetHeight ?? window.innerHeight;

  /** Position et voile ecrits directement dans le DOM, pour tenir la frame. */
  const place = useCallback((y: number, animate: boolean) => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!sheet || !scrim) return;

    sheet.style.transition = animate ? '' : 'none';
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;

    // Le voile suit la sheet en continu plutot que de s'allumer a la fin.
    const span = height() * (ANCHOR_OFFSET.closed - ANCHOR_OFFSET.full);
    const openness = Math.min(1, Math.max(0, (height() * ANCHOR_OFFSET.closed - y) / span));
    scrim.style.transition = animate ? '' : 'none';
    scrim.style.opacity = String(openness * 0.45);
    scrim.style.pointerEvents = openness > 0.02 ? 'auto' : 'none';
  }, []);

  useLayoutEffect(() => {
    place(ANCHOR_OFFSET[anchor] * height(), mounted.current);
    mounted.current = true;
  }, [anchor, place]);

  const onPointerDown = createDragHandler({
    axis: 'y',
    guardEdges: false,
    onMove: ({ dy }) => {
      const resting = ANCHOR_OFFSET[anchor] * height();
      const y = Math.max(ANCHOR_OFFSET.full * height(), resting + dy);
      place(y, false);

      // Retour haptique au franchissement de chaque seuil, pas en continu.
      const nearest = closestAnchor(y, height());
      if (nearest !== crossed.current) {
        crossed.current = nearest;
        haptic();
      }
    },
    onEnd: ({ dy, vy }) => {
      const resting = ANCHOR_OFFSET[anchor] * height();
      const anchors = ORDER.map((name) => ANCHOR_OFFSET[name] * height());
      const target = nearestAnchor(anchors, project(resting + dy, vy));
      const next = ORDER[anchors.indexOf(target)]!;

      crossed.current = null;

      if (next === anchor) {
        place(resting, true);
        return;
      }
      haptic();
      onAnchorChange(next); // le useLayoutEffect repositionne, avec animation
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

  return (
    <>
      <div ref={scrimRef} className={styles.scrim} onClick={close} aria-hidden />
      <div className={styles.sheet} ref={sheetRef} role="dialog" aria-hidden={anchor === 'closed'}>
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
