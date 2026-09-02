import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { DIRECTIONS, STALE_DATA_HOURS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useStore } from '../src/data/store.ts';
import { buildCalendar, emptyDay } from '../src/model.ts';
import { ageLabel, dirLabel, hoursSince, longDate, reverseDir } from '../src/format.ts';
import { QuotaCard, WatchCard } from '../src/ui/Cards.tsx';
import { CalendarPager } from '../src/ui/CalendarPager.tsx';
import { Segmented } from '../src/ui/Segmented.tsx';
import { radius, space, useTheme } from '../src/theme.ts';

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
  const [refreshing, setRefreshing] = useState(false);

  /*
   * Alternance de sens. Les trajets sont unitaires, pas des allers-retours,
   * mais ils alternent : si le dernier trajet etait Paris -> Bordeaux, le
   * prochain sera l'inverse. L'app s'ouvre sur le sens attendu.
   */
  useEffect(() => {
    const last = bundle.reservations.lastDir;
    if (!last) return;
    const expected = DIRECTIONS.indexOf(reverseDir(last) as (typeof DIRECTIONS)[number]);
    if (expected >= 0) {
      setIndex(expected);
      progress.value = expected;
    }
  }, [bundle.reservations.lastDir, progress]);

  const dir = DIRECTIONS[index]!;
  const todayDay = calendar.get(today)?.get(dir) ?? emptyDay(today, dir);
  const processed = bundle.state.dataProcessed;
  const stale = processed !== null && hoursSince(processed) > STALE_DATA_HOURS;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.muted}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={{ paddingHorizontal: space.lg }}>
        <Segmented
          labels={DIRECTIONS.map(dirLabel)}
          index={index}
          progress={progress}
          onChange={setIndex}
        />

        <View style={styles.status}>
          {/* La donnee peut avoir plus de 24 h : sa date de publication est la
              seule information d'etat du produit. */}
          <Text style={[styles.statusText, { color: theme.muted }]}>
            {loading
              ? 'chargement'
              : processed
                ? `données du ${processed.slice(8, 10)}/${processed.slice(5, 7)} · ${ageLabel(processed)}`
                : 'aucune donnée'}
            {offline ? ' · hors ligne' : ''}
          </Text>

          <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
            <Text style={[styles.statusText, { color: theme.muted }]}>réglages</Text>
          </Pressable>
        </View>

        {stale && (
          <View style={[styles.banner, { backgroundColor: theme.inverseBg, borderRadius: radius.sm }]}>
            <Text style={[styles.bannerText, { color: theme.inverseText }]}>
              Donnée vieille de plus de {STALE_DATA_HOURS} h : le collecteur ne tourne plus.
            </Text>
          </View>
        )}
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

      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl, gap: space.sm }}>
        <Pressable
          onPress={() => router.push({ pathname: '/day/[date]', params: { date: today, dir } })}
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line, borderRadius: radius.md }]}
        >
          <Text style={[styles.cardCount, { color: theme.text }]}>{todayDay.available}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {todayDay.available > 1 ? "places aujourd'hui" : "place aujourd'hui"}
            </Text>
            <Text style={[styles.cardSub, { color: theme.muted }]}>{longDate(today)}</Text>
          </View>
          {todayDay.onlyLong && (
            <Text style={[styles.chip, { color: theme.inverseText, backgroundColor: theme.inverseBg }]}>
              longs
            </Text>
          )}
        </Pressable>

        <WatchCard
          watchlist={bundle.watchlist}
          calendar={calendar}
          onPress={() => router.push('/settings')}
        />

        <QuotaCard
          reservations={bundle.reservations}
          onPress={() => router.push('/settings')}
        />

        {bundle.stats?.ready && (
          <Pressable
            onPress={() => router.push('/history')}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line, borderRadius: radius.md }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Érosion et prévisions</Text>
              <Text style={[styles.cardSub, { color: theme.muted }]}>
                {bundle.state.snapshotCount} jours d'archive
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.md,
  },
  statusText: { fontSize: 12 },
  banner: { marginTop: space.md, padding: space.md },
  bannerText: { fontSize: 12.5, fontWeight: '500' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardCount: { fontSize: 32, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSub: { fontSize: 12.5, marginTop: 2 },
  chip: {
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
