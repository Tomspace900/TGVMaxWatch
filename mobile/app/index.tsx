import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { DIRECTIONS, STALE_DATA_HOURS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useStore } from '../src/data/store.ts';
import { buildCalendar } from '../src/model.ts';
import { ageLabel, dirLabel, hoursSince, reverseDir } from '../src/format.ts';
import { QuotaCard, StatsCard, WatchCard } from '../src/ui/Cards.tsx';
import { CalendarPager } from '../src/ui/CalendarPager.tsx';
import { Locomotive, RailTrack, Wash } from '../src/ui/rail.tsx';
import { Segmented } from '../src/ui/Segmented.tsx';
import { BAR_HEIGHT, StickyBar } from '../src/ui/StickyBar.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';

export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, loading, offline, refresh } = useStore();

  const today = useMemo(() => todayInParis(), []);
  const calendar = useMemo(
    () => buildCalendar(bundle.latest, bundle.history),
    [bundle.latest, bundle.history],
  );

  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  /*
   * Alternance de sens. Les trajets sont unitaires, pas des allers-retours,
   * mais ils alternent : si le dernier trajet est Paris -> Bordeaux, le
   * prochain sera l'inverse. L'app s'ouvre sur le sens attendu.
   *
   * Le sens se deduit du creneau de plus grande date, il n'est plus stocke.
   * Un champ `lastDir` ecrit au moment de la reservation mentait des qu'on
   * reservait un trajet lointain puis un plus proche : c'est la date du
   * voyage qui ordonne, pas celle de la reservation.
   */
  const lastDir = useMemo(() => {
    let latest: { date: string; dir: string } | null = null;
    for (const slot of bundle.reservations.slots) {
      if (latest === null || slot.date > latest.date) latest = slot;
    }
    return latest?.dir ?? null;
  }, [bundle.reservations.slots]);

  useEffect(() => {
    if (!lastDir) return;
    const expected = DIRECTIONS.indexOf(reverseDir(lastDir) as (typeof DIRECTIONS)[number]);
    if (expected >= 0) {
      setIndex(expected);
      progress.value = expected;
    }
  }, [lastDir, progress]);

  const dir = DIRECTIONS[index]!;
  const processed = bundle.state.dataProcessed;
  const stale = processed !== null && hoursSince(processed) > STALE_DATA_HOURS;

  /*
   * Le bandeau des trois plus gros mouvements a disparu d'ici.
   *
   * Trois lignes sur trente et une dates, c'est un classement arbitraire : ni
   * le mouvement du jour qu'on surveille, ni la vue d'ensemble. Or `Day.delta`
   * est deja peint sur chaque case du calendrier, ou il se lit a cote du
   * compte qu'il corrige — c'est-a-dire au seul endroit ou il veut dire quelque
   * chose. Le bandeau n'ajoutait donc rien qu'un doublon partiel.
   *
   * La carte « places aujourd'hui » est partie avec, pour une autre raison :
   * personne n'ouvre cette application pour le train de ce soir. La fenetre
   * utile est J+2 a J+30, et le calendrier la couvre entierement.
   */
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + BAR_HEIGHT,
          paddingBottom: insets.bottom + space.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.muted}
            progressViewOffset={insets.top + BAR_HEIGHT}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {/* Le bandeau d'identite : la seule surface ou le degrade Carmillon se
            deploie en entier. La motrice regarde dans le sens du voyage. */}
        <View style={styles.hero}>
          <Wash />

          <View style={styles.heroTop}>
            <Text style={[typo.hero, styles.heroTitle, { color: theme.onBrand }]}>
              {dirLabel(dir)}
            </Text>
            <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={[typo.chip, { color: theme.onBrand, opacity: 0.85 }]}>RÉGLAGES</Text>
            </Pressable>
          </View>

          {/* La date de publication est la seule information d'etat du produit :
              la donnee peut avoir plus de 24 h sans que rien d'autre ne le dise. */}
          <Text style={[typo.digits, styles.heroMeta, { color: theme.onBrand }]}>
            {loading
              ? 'CHARGEMENT'
              : processed
                ? `${processed.slice(8, 10)}/${processed.slice(5, 7)} · ${ageLabel(processed)}`
                : 'AUCUNE DONNÉE'}
            {offline ? ' · HORS LIGNE' : ''}
          </Text>

          <View
            style={[
              styles.loco,
              // Un aller et un retour ne se dessinent pas pareil : la motrice
              // pointe vers la gare d'arrivee.
              { transform: [{ scaleX: index === 0 ? 1 : -1 }] },
            ]}
          >
            <Locomotive height={54} />
          </View>
        </View>

        {stale && (
          <View style={[styles.banner, { backgroundColor: theme.accent, marginHorizontal: space.lg }]}>
            <Text style={[typo.strong, { color: theme.onBrand }]}>
              Donnée vieille de plus de {STALE_DATA_HOURS} h : le collecteur ne tourne plus.
            </Text>
          </View>
        )}

        <View style={{ marginTop: space.lg }}>
          <CalendarPager
            calendar={calendar}
            today={today}
            directions={DIRECTIONS}
            index={index}
            progress={progress}
            onIndexChange={setIndex}
            onSelect={(date, selectedDir) =>
              router.push({ pathname: '/day/[date]', params: { date, dir: selectedDir } })
            }
          />
        </View>

        <RailTrack style={{ marginTop: space.xl, marginHorizontal: space.lg }} />

        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg, gap: space.md }}>
          <WatchCard
            watchlist={bundle.watchlist}
            calendar={calendar}
            trains={bundle.trains}
            onPress={() => router.push('/settings')}
          />

          <QuotaCard reservations={bundle.reservations} onPress={() => router.push('/settings')} />

          {bundle.stats?.ready.erosion && (
            <StatsCard
              snapshotCount={bundle.state.snapshotCount}
              onPress={() => router.push('/history')}
            />
          )}
        </View>
      </Animated.ScrollView>

      <StickyBar scrollY={scrollY}>
        <View style={{ paddingHorizontal: space.lg }}>
          <Segmented
            labels={DIRECTIONS.map(dirLabel)}
            index={index}
            progress={progress}
            onChange={setIndex}
          />
        </View>
      </StickyBar>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  heroTitle: { flexShrink: 1 },
  heroMeta: { marginTop: 2, opacity: 0.9 },
  // La motrice deborde volontairement a droite : une rame ne tient pas dans
  // l'ecran, et la couper rappelle qu'elle continue.
  loco: { alignSelf: 'flex-end', marginRight: -space.xl, marginTop: -space.sm },
  banner: { marginTop: space.md, padding: space.md, borderRadius: radius.sm },
});
