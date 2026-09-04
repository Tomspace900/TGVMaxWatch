import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DIRECTIONS, HORIZON_DAYS, MAX_RESERVATIONS } from '../../../src/config.ts';
import { addDays, todayInParis, weekday } from '../../../src/dates.ts';
import { trainsWord } from '../../../src/label.ts';
import { slotOf } from '../../../src/stats.ts';
import { matchesWatchlist } from '../../../src/watchlist.ts';
import { useStore } from '../../src/data/store.ts';
import { writeFile } from '../../src/data/github.ts';
import { scheduleConfirmReminder } from '../../src/data/reminders.ts';
import { buildCalendar, emptyDay } from '../../src/model.ts';
import { dirLabel, longDate } from '../../src/format.ts';
import { Sparkline } from '../../src/ui/Sparkline.tsx';
import { BAR_HEIGHT, StickyBar } from '../../src/ui/StickyBar.tsx';
import { TrainRow } from '../../src/ui/TrainRow.tsx';
import { radius, space, typo, useTheme } from '../../src/theme.ts';
import type { Train } from '../../src/model.ts';
import type { Watchlist } from '../../../src/types.ts';

const TrainList = Animated.FlatList<Train>;

export default function DayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { bundle, setWatchlist, setReservations } = useStore();

  const params = useLocalSearchParams<{ date: string; dir?: string }>();
  const dir = params.dir ?? DIRECTIONS[0]!;

  /*
   * La date vit en etat local, pas dans la route.
   *
   * Passer au lendemain en empilant un ecran de plus ferait grossir la pile a
   * chaque pas, et le retour systeme d'Android deroulerait alors les jours un a
   * un au lieu de revenir au calendrier. Ici, le retour ramene toujours d'ou
   * l'on vient.
   */
  const today = useMemo(() => todayInParis(), []);
  const [date, setDate] = useState(params.date);

  const first = today;
  const last = addDays(today, HORIZON_DAYS);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const step = (days: number) => {
    const next = addDays(date, days);
    if (next < first || next > last) return;
    void Haptics.selectionAsync();
    setDate(next);
  };

  const calendar = useMemo(
    () => buildCalendar(bundle.latest, bundle.history),
    [bundle.latest, bundle.history],
  );

  const day = calendar.get(date)?.get(dir) ?? emptyDay(date, dir);
  const series = bundle.history[date]?.[dir] ?? [];

  /*
   * Disponibilite jour apres jour de chaque train de cette date.
   *
   * C'est la seule vue que la source ne pourra jamais donner : elle ecrase son
   * dataset chaque jour. Un train encore libre qui vient de rouvrir apres
   * plusieurs jours complets ne se lit nulle part ailleurs.
   */
  const traces = useMemo(
    () => bundle.trains.series[`${date}|${dir}`] ?? {},
    [bundle.trains.series, date, dir],
  );

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

  /**
   * Enregistrer une reservation.
   *
   * Le quota TGVmax porte sur les reservations *simultanees* : un creneau se
   * libere quand le train est passe. Compter les voyages deja faits afficherait
   * « 6 / 6 » avec un quota reel vide, et bloquerait l'enregistrement.
   */
  const book = (trainNo: string, depart: string, arrivee: string) => {
    const upcoming = bundle.reservations.slots.filter((slot) => slot.date >= today);
    if (upcoming.length >= MAX_RESERVATIONS) {
      router.push('/settings');
      return;
    }

    const slot = { date, dir, trainNo, depart, arrivee, bookedAt: today, confirmed: false };
    setReservations((current) => ({ slots: [...current.slots, slot] }));

    // Le rappel part du telephone, pas d'une Action : il ne peut ni arriver en
    // retard, ni se retirer en silence comme le cron qu'il remplace.
    void scheduleConfirmReminder(slot);
  };

  const forecast = useMemo(() => {
    if (!bundle.stats?.ready.burnRate) return null;
    const firstFree = day.trains.find((train) => train.available);
    if (!firstFree) return null;

    const row = bundle.stats.burnRate.find(
      (entry) =>
        entry.weekday === weekday(date) && entry.dir === dir && entry.slot === slotOf(firstFree.depart),
    );
    if (!row) return null;

    // Toujours montrer la taille d'echantillon : une mediane sur trois
    // observations et une sur trente ne se lisent pas pareil.
    return `Ce créneau part en général vers J-${row.medianDaysBefore} — sur ${row.sample} observations.`;
  }, [bundle.stats, day.trains, date, dir]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TrainList
        data={day.trains}
        keyExtractor={(train) => `${train.trainNo}-${train.depart}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + BAR_HEIGHT + space.md,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.lg,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <Text style={[typo.small, { color: theme.muted }]}>{dirLabel(dir)}</Text>

            <View
              style={[
                styles.summary,
                { backgroundColor: theme.sunken, borderRadius: radius.md, marginTop: space.sm },
              ]}
            >
              <Text style={[typo.counter, { color: theme.text }]}>{day.available}</Text>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[typo.body, { color: theme.text }]}>
                  {day.available === 0
                    ? 'aucun train ouvert'
                    : `${trainsWord(day.available)} ouverts au TGVmax`}
                </Text>
                <Text style={[typo.small, { color: theme.muted }]}>
                  sur {day.trains.length} qui circulent
                </Text>
                {day.onlyLong && (
                  <Text style={[typo.chip, { color: theme.accent }]}>
                    TOUS SUR DES TRAJETS LONGS
                  </Text>
                )}
              </View>
              {series.length >= 2 && (
                <Sparkline
                  series={series}
                  width={Math.min(120, width * 0.3)}
                  height={40}
                  color={theme.avail[3]!}
                />
              )}
            </View>

            {forecast && (
              <Text
                style={[
                  typo.small,
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
            trace={traces[item.trainNo]}
            onWatch={() => toggleWatch(item.depart)}
            onBook={() => book(item.trainNo, item.depart, item.arrivee)}
          />
        )}
        ListEmptyComponent={
          <Text style={[typo.body, styles.empty, { color: theme.muted }]}>
            Aucun train connu pour ce jour.
          </Text>
        }
        ListFooterComponent={
          day.trains.length === 0 ? null : (
            <Text style={[typo.small, styles.hint, { color: theme.muted }]}>
              Glisser vers la gauche pour surveiller, vers la droite après avoir réservé.
            </Text>
          )
        }
      />

      <StickyBar scrollY={scrollY}>
        <View style={styles.bar}>
          <Pressable onPress={() => router.back()} hitSlop={14} style={styles.back}>
            <Text style={[typo.title, { color: theme.muted }]}>‹</Text>
          </Pressable>

          <Text style={[typo.section, { color: theme.text, flex: 1 }]} numberOfLines={1}>
            {longDate(date)}
          </Text>

          {/* Passer au jour suivant sans repasser par le calendrier : c'est le
              geste qu'on fait vraiment quand un creneau ne convient pas. */}
          <View style={styles.steps}>
            <Step label="‹" enabled={date > first} onPress={() => step(-1)} />
            <Step label="›" enabled={date < last} onPress={() => step(1)} />
          </View>
        </View>
      </StickyBar>
    </View>
  );
}

function Step({
  label,
  enabled,
  onPress,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      hitSlop={10}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: theme.sunken,
          borderRadius: radius.sm,
          opacity: enabled ? (pressed ? 0.6 : 1) : 0.3,
        },
      ]}
    >
      <Text style={[typo.section, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  back: { width: 22 },
  steps: { flexDirection: 'row', gap: space.xs + 2 },
  step: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg },
  forecast: { padding: space.md, marginTop: space.md, overflow: 'hidden', lineHeight: 18 },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  hint: { textAlign: 'center', paddingTop: space.md },
});
