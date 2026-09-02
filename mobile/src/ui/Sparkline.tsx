import Svg, { Polyline } from 'react-native-svg';
import type { Observation } from '../../../src/types.ts';

interface Props {
  series: Observation[];
  width: number;
  height: number;
  color: string;
}

/**
 * Courbe d'evolution d'une date de voyage.
 *
 * Repond a la seule question qui compte devant une date : est-ce que ca fond,
 * et a quelle vitesse. Impossible sans l'archive locale — la source ne
 * conserve aucun passe.
 */
export function Sparkline({ series, width, height, color }: Props) {
  if (series.length < 2) return null;

  const max = Math.max(...series.map((point) => point.oui), 1);
  const step = width / (series.length - 1);

  const points = series
    .map((point, index) => `${index * step},${height - (point.oui / max) * (height - 3) - 1.5}`)
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
