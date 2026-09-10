import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import { DIRECTIONS, HORIZON_DAYS } from '../../src/config.ts';
import { EROSION_MIN_SNAPSHOTS, erosionSnapshotsLeft } from '../../src/stats.ts';
import { useStore } from '../src/data/store.ts';
import { dirLabel } from '../src/format.ts';
import { radius, space, typo, useTheme } from '../src/theme.ts';

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const CHART_HEIGHT = 110;

/**
 * Courbe d'erosion moyenne J-30 -> J-0.
 *
 * C'est la seule vue que personne d'autre ne peut produire : elle demande un
 * historique que la source ne conserve pas. Elle repond a la question qu'on se
 * pose devant une date encore lointaine — est-ce que j'ai le temps.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { bundle } = useStore();

  const [dirIndex, setDirIndex] = useState(0);
  const dir = DIRECTIONS[dirIndex]!;
  const chartWidth = width - space.lg * 4;
  const left = erosionSnapshotsLeft(bundle.state.snapshotCount);

  const curves = useMemo(
    () => (bundle.stats?.erosion ?? []).filter((curve) => curve.dir === dir),
    [bundle.stats, dir],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Érosion</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.close, { color: theme.muted }]}>fermer</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setDirIndex((current) => (current + 1) % DIRECTIONS.length)}
        style={[styles.dirToggle, { backgroundColor: theme.sunken, borderRadius: radius.pill }]}
      >
        <Text style={[styles.dirText, { color: theme.text }]}>{dirLabel(dir)}</Text>
      </Pressable>

      {/* Ce qui manque, dans l'unite ou ca se compte — et non « pas encore assez
          de recul », qui ne dit ni combien ni jusqu'a quand. Le seuil vient de
          `src/stats.ts` : la phrase annoncait huit semaines, une regle qui
          n'existe plus depuis que chaque metrique porte sa propre garde. */}
      {!bundle.stats?.ready.erosion && (
        <Text style={[styles.muted, { color: theme.muted, marginTop: space.lg }]}>
          {`Une courbe couvre l’arche entière d’une date de voyage, de J+${HORIZON_DAYS} à son départ. Il faut donc ${EROSION_MIN_SNAPSHOTS} collectes ; l’archive en compte ${bundle.state.snapshotCount}, il en manque ${left} au plus tôt — une journée manquée repousse d’autant.\n\nRien n’est affiché en attendant : des données brutes valent mieux qu’une estimation inventée sur trois observations.`}
        </Text>
      )}

      {curves.map((curve) => {
        const max = Math.max(...curve.points.map((point) => point.avg), 1);
        const sample = Math.min(...curve.points.map((point) => point.sample));
        const sorted = [...curve.points].sort((a, b) => b.daysBefore - a.daysBefore);

        // L'axe va de J+30 a gauche vers J-0 a droite : on lit dans le sens du
        // temps, pas dans celui de la distance.
        const toX = (daysBefore: number) =>
          ((HORIZON_DAYS - daysBefore) / HORIZON_DAYS) * chartWidth;
        const toY = (avg: number) => CHART_HEIGHT - (avg / max) * (CHART_HEIGHT - 8) - 4;

        const line = sorted.map((p) => `${toX(p.daysBefore)},${toY(p.avg)}`).join(' ');

        return (
          <View
            key={`${curve.weekday}-${curve.dir}`}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line, borderRadius: radius.md }]}
          >
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {WEEKDAYS[curve.weekday]}s
              </Text>
              {/* Toujours montrer la taille d'echantillon. */}
              <Text style={[styles.muted, { color: theme.muted }]}>{sample} observations</Text>
            </View>

            <Svg width={chartWidth} height={CHART_HEIGHT}>
              <Polygon
                points={`0,${CHART_HEIGHT} ${line} ${chartWidth},${CHART_HEIGHT}`}
                fill={theme.avail[3]}
                fillOpacity={0.16}
              />
              <Polyline
                points={line}
                fill="none"
                stroke={theme.avail[3]}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </Svg>

            <View style={styles.axis}>
              <Text style={[styles.axisText, { color: theme.muted }]}>J+{HORIZON_DAYS}</Text>
              <Text style={[styles.axisText, { color: theme.muted }]}>J+15</Text>
              <Text style={[styles.axisText, { color: theme.muted }]}>J-0</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...typo.hero },
  close: { ...typo.body, fontSize: 14 },
  dirToggle: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, marginTop: space.md },
  dirText: { ...typo.section, fontSize: 13 },
  card: { padding: space.lg, marginTop: space.md, borderWidth: StyleSheet.hairlineWidth },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  cardTitle: { ...typo.section, fontSize: 14 },
  muted: { ...typo.small, lineHeight: 18 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  axisText: { ...typo.digits, fontSize: 10 },
});
