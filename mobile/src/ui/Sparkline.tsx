import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { typo } from '../theme.ts';
import type { Observation } from '../../../src/types.ts';

interface Props {
  series: Observation[];
  width: number;
  height: number;
  color: string;
  /** Ligne de zero et graduations. */
  line: string;
  muted: string;
}

/** Largeur de la colonne des graduations. Deux chiffres en mono y tiennent. */
const GUTTER = 22;

/**
 * Courbe d'evolution d'une date de voyage.
 *
 * Repond a la seule question qui compte devant une date : est-ce que ca fond,
 * et a quelle vitesse. Impossible sans l'archive locale — la source ne
 * conserve aucun passe.
 *
 * Une courbe nue montait et descendait sans dire de combien : « ca baisse »
 * sans savoir si c'est de vingt a dix-huit ou de cinq a un ne decide rien.
 * C'est la meme faute que les lignes de notification avant qu'elles ne portent
 * l'avant/apres. Deux graduations suffisent — le maximum et le zero — et elles
 * portent l'echelle sans ajouter un troisieme nombre a lire : la forme reste ce
 * qu'on regarde, l'echelle ne fait que la rendre interpretable.
 *
 * Le zero est trace, pas seulement ecrit. Une courbe qui touche le trait du bas
 * dit « aucun train » d'un coup d'oeil, la ou un axe implicite laissait croire
 * que le creux etait un minimum relatif.
 */
export function Sparkline({ series, width, height, color, line, muted }: Props) {
  if (series.length < 2) return null;

  const plot = Math.max(width - GUTTER, 1);
  const max = Math.max(...series.map((point) => point.oui), 1);
  const step = plot / (series.length - 1);

  // Le trait de zero occupe la derniere ligne de pixels : la courbe se pose
  // dessus au lieu de flotter au-dessus.
  const floor = height - 1;
  const top = 1.5;

  const points = series
    .map(
      (point, index) =>
        `${index * step},${floor - (point.oui / max) * (floor - top)}`,
    )
    .join(' ');

  return (
    <View style={[styles.row, { width, height }]}>
      <View style={[styles.gutter, { height }]}>
        <Text style={[typo.digits, styles.tick, { color: muted }]}>{max}</Text>
        <Text style={[typo.digits, styles.tick, { color: muted }]}>0</Text>
      </View>

      <Svg width={plot} height={height}>
        <Line x1={0} y1={floor} x2={plot} y2={floor} stroke={line} strokeWidth={1} />
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  gutter: { width: GUTTER, justifyContent: 'space-between', alignItems: 'flex-end' },
  // Les graduations s'alignent sur les traits qu'elles nomment, et non sur les
  // bords de la boite : le zero est sur la ligne du bas, pas dessous.
  tick: { lineHeight: 12, marginRight: 4 },
});
