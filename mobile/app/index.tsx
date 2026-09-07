import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { DIRECTIONS, STALE_ALARM_HOURS, STALE_DATA_HOURS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useStore } from '../src/data/store.ts';
import { cancelConfirmReminder } from '../src/data/reminders.ts';
import { buildCalendar } from '../src/model.ts';
import { ageLabel, dirLabel, hoursSince, reverseDir } from '../src/format.ts';
import { ConfirmCard, StatsCard, WatchCard } from '../src/ui/Cards.tsx';
import { CalendarPager } from '../src/ui/CalendarPager.tsx';
import { RailTrack } from '../src/ui/rail.tsx';
import { Segmented } from '../src/ui/Segmented.tsx';
import { BAR_HEIGHT, StickyBar } from '../src/ui/StickyBar.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';
import type { Reservation } from '../../src/types.ts';

export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, loading, offline, refresh, setReservations } = useStore();

  const today = useMemo(() => todayInParis(), []);
  const calendar = useMemo(() => buildCalendar(bundle.latest), [bundle.latest]);

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
  const age = processed === null ? null : hoursSince(processed);

  /*
   * Trois etats, pas un seul.
   *
   * `STALE_DATA_HOURS` et `STALE_ALARM_HOURS` decrivent deux situations
   * differentes — une donnee qui a pris du retard, et une collecte qui ne
   * repond plus — et elles etaient fondues dans le meme bandeau. Le silence
   * etant le mode de panne de ce projet, la nuance est precisement ce qu'il
   * faut savoir : la premiere se rattrape au run suivant, la seconde demande
   * d'aller voir.
   */
  const alarm = age !== null && age > STALE_ALARM_HOURS;
  const stale = age !== null && age > STALE_DATA_HOURS;

  /** « C'est fait » : le creneau est confirme, et le rappel qui l'accompagnait se tait. */
  const markConfirmed = (slot: Reservation) => {
    setReservations((current) => ({
      slots: current.slots.map((entry) =>
        entry.date === slot.date && entry.dir === slot.dir && entry.trainNo === slot.trainNo
          ? { ...entry, confirmed: true }
          : entry,
      ),
    }));
    void cancelConfirmReminder(slot);
  };

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
        {/* La date de publication est la seule information d'etat du produit.
            Elle vivait en sous-ligne decorative sur un fond en degrade, a
            l'endroit le plus facile a supprimer ; elle est ici en texte plein
            contraste, avec les reglages, l'autre element de meta de l'ecran. */}
        <View style={[styles.meta, { paddingHorizontal: space.lg }]}>
          <Text style={[typo.small, { color: theme.muted }]}>
            {loading
              ? 'chargement'
              : processed
                ? `données du ${processed.slice(8, 10)}/${processed.slice(5, 7)} · ${ageLabel(processed)}`
                : 'aucune donnée'}
            {offline ? ' · hors ligne' : ''}
          </Text>

          <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
            <Text style={[typo.strong, { color: theme.muted }]}>réglages</Text>
          </Pressable>
        </View>

        {stale && (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.accent, marginHorizontal: space.lg, borderRadius: radius.sm },
            ]}
          >
            <Text style={[typo.strong, { color: theme.onBrand, lineHeight: 18 }]}>
              {alarm
                ? `Aucune donnée nouvelle depuis plus de ${STALE_ALARM_HOURS} h : la collecte ne répond plus.`
                : `Donnée de plus de ${STALE_DATA_HOURS} h : la collecte a pris du retard.`}
            </Text>
          </View>
        )}

        {/* Le seul endroit ou cette application peut couter de l'argent reel :
            au-dessus de tout le reste, et seulement quand c'est vrai. */}
        <View style={{ paddingHorizontal: space.lg }}>
          <ConfirmCard reservations={bundle.reservations} onConfirm={markConfirmed} />
        </View>

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
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  banner: { padding: space.md, marginBottom: space.sm },
});
