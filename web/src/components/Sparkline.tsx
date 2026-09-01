import type { Observation } from '../../../src/types.ts';

interface Props {
  series: Observation[];
  /** Hauteur en pixels. La largeur suit le conteneur. */
  height?: number;
}

/**
 * Courbe d'evolution d'une date de voyage.
 *
 * Repond a la seule question qui compte devant une date : « est-ce que ca
 * fond, et a quelle vitesse ? ». Impossible sans l'archive locale, la source
 * ne conservant aucun passe.
 */
export function Sparkline({ series, height = 34 }: Props) {
  if (series.length < 2) return null;

  const max = Math.max(...series.map((point) => point.oui), 1);
  const step = 100 / (series.length - 1);

  const points = series
    .map((point, index) => `${index * step},${height - (point.oui / max) * (height - 3) - 1.5}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      height={height}
      width="100%"
      preserveAspectRatio="none"
      aria-label={`Evolution : ${series.map((point) => point.oui).join(', ')}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
