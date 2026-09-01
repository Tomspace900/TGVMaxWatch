/**
 * Couche gestuelle.
 *
 * Le geste est le mode d'interaction principal, le tap est le repli. Ce qui
 * fait « natif » n'est pas l'animation d'arrivee mais le suivi 1:1 du doigt et
 * l'interruptibilite : on suit donc les Pointer Events a la main plutot que de
 * deleguer a une librairie dont il faudrait contourner l'abstraction.
 */

/** Largeur des bords captes par le geste de retour systeme sur Android. */
export const EDGE_GUARD_PX = 24;

/** Duree de projection de la vitesse, en secondes. */
const PROJECTION_S = 0.25;

/** Fenetre d'echantillonnage de la vitesse. Au-dela, le doigt s'est arrete. */
const VELOCITY_WINDOW_MS = 90;

export interface DragSample {
  /** Deplacement depuis le point de depart, en pixels. */
  dx: number;
  dy: number;
  /** Vitesse instantanee, en pixels par seconde. */
  vx: number;
  vy: number;
}

interface Point {
  x: number;
  y: number;
  t: number;
}

/** Accepte indifferemment un evenement natif ou son enveloppe React. */
export interface PointerLike {
  button?: number;
  clientX: number;
  clientY: number;
  nativeEvent?: PointerEvent;
}

export interface DragOptions {
  /** Axe suivi. L'autre axe laisse passer le scroll natif. */
  axis: 'x' | 'y';
  /** Refuse un geste qui demarre dans la zone de retour systeme. */
  guardEdges?: boolean;
  onStart?: () => void;
  onMove: (sample: DragSample) => void;
  onEnd: (sample: DragSample) => void;
}

/**
 * Attache un suivi de glissement a un element.
 *
 * Renvoie le handler `pointerdown` a poser sur l'element ; les mouvements sont
 * ensuite ecoutes sur la fenetre, pour que le geste survive a la sortie du
 * doigt hors de l'element.
 */
export function createDragHandler(options: DragOptions) {
  return function onPointerDown(event: PointerLike): void {
    const native = 'nativeEvent' in event && event.nativeEvent ? event.nativeEvent : event;
    if (native.button !== undefined && native.button !== 0) return;

    if (options.guardEdges !== false && options.axis === 'x') {
      const width = window.innerWidth;
      if (native.clientX < EDGE_GUARD_PX || native.clientX > width - EDGE_GUARD_PX) return;
    }

    const origin: Point = { x: native.clientX, y: native.clientY, t: performance.now() };
    const trail: Point[] = [origin];
    let claimed = false;

    const sampleOf = (point: Point): DragSample => {
      const cutoff = point.t - VELOCITY_WINDOW_MS;
      const oldest = trail.find((entry) => entry.t >= cutoff) ?? trail[0]!;
      const elapsed = Math.max(1, point.t - oldest.t) / 1000;
      return {
        dx: point.x - origin.x,
        dy: point.y - origin.y,
        vx: (point.x - oldest.x) / elapsed,
        vy: (point.y - oldest.y) / elapsed,
      };
    };

    const onMove = (move: PointerEvent): void => {
      const point: Point = { x: move.clientX, y: move.clientY, t: performance.now() };
      trail.push(point);
      if (trail.length > 12) trail.shift();

      const sample = sampleOf(point);

      // On ne prend la main qu'une fois l'intention claire sur notre axe :
      // en dessous, le scroll natif doit rester possible.
      if (!claimed) {
        const primary = options.axis === 'x' ? Math.abs(sample.dx) : Math.abs(sample.dy);
        const secondary = options.axis === 'x' ? Math.abs(sample.dy) : Math.abs(sample.dx);
        if (primary < 6 || primary <= secondary) return;
        claimed = true;
        options.onStart?.();
      }

      if (move.cancelable) move.preventDefault();
      options.onMove(sample);
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!claimed) return;
      options.onEnd(sampleOf({ x: up.clientX, y: up.clientY, t: performance.now() }));
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
}

/**
 * Position projetee apres relachement.
 *
 * Un geste rapide doit atteindre l'ancrage suivant meme s'il s'arrete a
 * mi-chemin : c'est la vitesse qui decide, pas la position au moment du
 * relachement.
 */
export function project(position: number, velocity: number): number {
  return position + velocity * PROJECTION_S;
}

/** Ancrage le plus proche d'une position projetee. */
export function nearestAnchor(anchors: readonly number[], target: number): number {
  return anchors.reduce((best, anchor) =>
    Math.abs(anchor - target) < Math.abs(best - target) ? anchor : best,
  );
}

/**
 * Retour haptique.
 *
 * Uniquement au franchissement d'un seuil et a l'accrochage d'un ancrage,
 * jamais sur un tap simple — sinon la vibration devient du bruit.
 */
export function haptic(duration = 10): void {
  navigator.vibrate?.(duration);
}
