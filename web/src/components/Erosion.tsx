import { useMemo } from 'react';
import { HORIZON_DAYS } from '../../../src/config.ts';
import { weekdayFull } from '../lib/format.ts';
import type { Stats } from '../../../src/types.ts';
import styles from './Erosion.module.css';

const HEIGHT = 54;

interface Props {
  stats: Stats | null;
  dir: string;
  /** Date de voyage selectionnee ou survolee, pour cibler le bon jour de semaine. */
  date: string;
}

/**
 * Courbe d'erosion moyenne J-30 -> J-0.
 *
 * C'est la seule vue que personne d'autre ne peut produire : elle demande un
 * historique que la source ne conserve pas. Elle repond a la vraie question
 * devant une date encore lointaine — « est-ce que j'ai le temps ? ».
 *
 * Tant que l'echantillon est trop mince, ce panneau ne s'affiche pas du tout :
 * mieux vaut du vide qu'une courbe inventee sur trois observations.
 */
export function Erosion({ stats, dir, date }: Props) {
  const curve = useMemo(() => {
    if (!stats?.ready) return null;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return stats.erosion.find((entry) => entry.weekday === weekday && entry.dir === dir) ?? null;
  }, [stats, dir, date]);

  if (!curve || curve.points.length < 4) return null;

  const max = Math.max(...curve.points.map((point) => point.avg), 1);
  const sample = Math.min(...curve.points.map((point) => point.sample));

  // L'axe va de J+30 (a gauche) a J-0 (a droite) : on lit dans le sens du temps.
  const toX = (daysBefore: number) => ((HORIZON_DAYS - daysBefore) / HORIZON_DAYS) * 100;
  const toY = (avg: number) => HEIGHT - (avg / max) * (HEIGHT - 4) - 2;

  const sorted = [...curve.points].sort((a, b) => b.daysBefore - a.daysBefore);
  const line = sorted.map((point) => `${toX(point.daysBefore)},${toY(point.avg)}`).join(' ');
  const area = `${toX(HORIZON_DAYS)},${HEIGHT} ${line} ${toX(0)},${HEIGHT}`;

  return (
    <section className={styles.panel}>
      <p className={styles.title}>
        <span>Erosion moyenne — {weekdayFull(date)}s</span>
        <span>{sample} observations</span>
      </p>

      <svg
        className={styles.chart}
        viewBox={`0 0 100 ${HEIGHT}`}
        height={HEIGHT}
        preserveAspectRatio="none"
        aria-label="Nombre moyen de trains eligibles restants selon la distance au depart"
      >
        <polygon points={area} fill="currentColor" opacity="0.18" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={styles.axis}>
        <span>J+{HORIZON_DAYS}</span>
        <span>J+15</span>
        <span>J-0</span>
      </div>
    </section>
  );
}
