import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DIRECTIONS, MAX_RESERVATIONS } from '../../../src/config.ts';
import { todayInParis, weekday } from '../../../src/dates.ts';
import { slotOf } from '../../../src/stats.ts';
import { matchesWatchlist } from '../../../src/watchlist.ts';
import { useStore } from '../../src/data/store.ts';
import { writeFile } from '../../src/data/github.ts';
import { buildCalendar, emptyDay } from '../../src/model.ts';
import { dirLabel, longDate } from '../../src/format.ts';
import { Sparkline } from '../../src/ui/Sparkline.tsx';
import { TrainRow } from '../../src/ui/TrainRow.tsx';
import { radius, space, useTheme } from '../../src/theme.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

export default function DayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { bundle, setWatchlist, setReservations } = useStore();

  const params = useLocalSearchParams<{ date: string; dir?: string }>();
  const date = params.date;
  const dir = params.dir ?? DIRECTIONS[0];

  const calendar = useMemo(
    () => buildCalendar(bundle.latest, bundle.history),
    [bundle.latest, bundle.history],
  );

  const day = calendar.get(date)?.get(dir) ?? emptyDay(date, dir);
  const series = bundle.history[date]?.[dir] ?? [];

  const booked = useMemo(
    () =>
      new Set(
        bundle.reservations.slots
          .filter((slot) => slot.date === date && slot.dir === dir)
          .map((slot) => slot.trainNo),
      ),
    [bundle.reservations.slots, date, dir],
  );

  /**
   * Le badge « suivi » se lit « une alerte partira pour ce train ». Il se
   * decide donc par train, sur la fonction qui filtre reellement les
   * notifications cote collecteur.
   */
  const isWatched = (depart: string) =>
    matchesWatchlist(bundle.watchlist, { date, dir, depart });

  const persist = useCallback(async (path: string, value: unknown, message: string) => {
    try {
      await writeFile(path, value, message);
    } catch {
      // Sans jeton, l'edition reste locale a cette session ; le prochain
      // rafraichissement la remplacera par la version du depot.
    }
  }, []);

  /**
   * Surveiller un train depuis son balayage.
   *
   * La fenetre est fermee des deux cotes sur l'heure de depart : avec le seul
   * `after`, l'entree se lirait « previens-moi pour tout train apres 06h06 » et
   * couvrirait la journee entiere. Le geste bascule, pour qu'une repetition ne
   * cree pas de doublon.
   */
  const toggleWatch = (depart: string) => {
    const already = bundle.watchlist.watch.findIndex(
      (entry) => entry.date === date && entry.dir === dir && entry.after === depart,
    );

    const watch =
      already === -1
        ? [...bundle.watchlist.watch, { date, dir, after: depart, before: depart }]
        : bundle.watchlist.watch.filter((_, i) => i !== already);

    const next: Watchlist = { ...bundle.watchlist, watch };
    setWatchlist(next);
    void persist('watchlist.json', next, `watchlist: ${already === -1 ? 'surveille' : 'retire'} ${date} ${depart}`);
  };

  const book = (trainNo: string, depart: string, arrivee: string) => {
    if (bundle.reservations.slots.length >= MAX_RESERVATIONS) {
      router.push('/settings');
      return;
    }

    const next: Reservations = {
      lastDir: dir,
      slots: [
        ...bundle.reservations.slots,
        { date, dir, trainNo, depart, arrivee, bookedAt: todayInParis(), confirmed: false },
      ],
    };
    setReservations(next);
    void persist('reservations.json', next, `resa: ${date} ${depart}`);
  };

  const forecast = useMemo(() => {
    if (!bundle.stats?.ready) return null;
    const first = day.trains.find((train) => train.available);
    if (!first) return null;

    const row = bundle.stats.burnRate.find(
      (entry) =>
        entry.weekday === weekday(date) && entry.dir === dir && entry.slot === slotOf(first.depart),
    );
    if (!row) return null;

    // Toujours montrer la taille d'echantillon : une mediane sur trois
    // observations et une sur trente ne se lisent pas pareil.
    return `Ce créneau part en général en ${row.medianDays} jour${
      row.medianDays > 1 ? 's' : ''
    } — sur ${row.sample} observations.`;
  }, [bundle.stats, day.trains, date, dir]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={day.trains}
        keyExtractor={(train) => `${train.trainNo}-${train.depart}`}
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.lg,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginBottom: space.md }}>
              <Text style={[styles.back, { color: theme.muted }]}>‹ calendrier</Text>
            </Pressable>

            <Text style={[styles.title, { color: theme.text }]}>{longDate(date)}</Text>
            <Text style={[styles.dir, { color: theme.muted }]}>{dirLabel(dir)}</Text>

            <View
              style={[
                styles.summary,
                { backgroundColor: theme.sunken, borderRadius: radius.md, marginTop: space.lg },
              ]}
            >
              <Text style={[styles.big, { color: theme.text }]}>{day.available}</Text>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.label, { color: theme.muted }]}>
                  {day.available === 0
                    ? 'aucune place'
                    : `place${day.available > 1 ? 's' : ''} sur ${day.trains.length} trains`}
                </Text>
                {day.onlyLong && (
                  <Text style={[styles.warn, { color: theme.text }]}>
                    toutes sur des trains longs
                  </Text>
                )}
              </View>
              {series.length >= 2 && (
                <Sparkline
                  series={series}
                  width={Math.min(140, width * 0.34)}
                  height={40}
                  color={theme.avail[3]!}
                />
              )}
            </View>

            {forecast && (
              <Text
                style={[
                  styles.forecast,
                  { color: theme.muted, backgroundColor: theme.sunken, borderRadius: radius.sm },
                ]}
              >
                {forecast}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TrainRow
            train={item}
            watched={isWatched(item.depart)}
            booked={booked.has(item.trainNo)}
            onWatch={() => toggleWatch(item.depart)}
            onBook={() => book(item.trainNo, item.depart, item.arrivee)}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.muted }]}>Aucun train connu pour ce jour.</Text>
        }
        ListFooterComponent={
          day.trains.length === 0 ? null : (
            <Text style={[styles.hint, { color: theme.muted }]}>
              Glisser vers la gauche pour surveiller, vers la droite après avoir réservé.
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { fontSize: 14, fontWeight: '500' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  dir: { fontSize: 13, marginTop: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg },
  big: { fontSize: 36, fontWeight: '800' },
  label: { fontSize: 12.5 },
  warn: { fontSize: 12, fontWeight: '700' },
  forecast: { fontSize: 12.5, padding: space.md, marginTop: space.md, overflow: 'hidden' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: space.xl },
  hint: { fontSize: 11.5, textAlign: 'center', paddingTop: space.md },
});
