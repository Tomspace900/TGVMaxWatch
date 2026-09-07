import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DIRECTIONS, HORIZON_DAYS } from '../../../src/config.ts';
import { addDays, todayInParis, weekday } from '../../../src/dates.ts';
import { trainsWord } from '../../../src/label.ts';
import { slotOf } from '../../../src/stats.ts';
import { matchesWatchlist, pruneWatch } from '../../../src/watchlist.ts';
import { useStore } from '../../src/data/store.ts';
import { toggleBooking } from '../../src/data/booking.ts';
import { buildCalendar, emptyDay } from '../../src/model.ts';
import { dirLabel, longDate, watchCutoff } from '../../src/format.ts';
import { Sparkline } from '../../src/ui/Sparkline.tsx';
import { BAR_HEIGHT, StickyBar } from '../../src/ui/StickyBar.tsx';
import { TrainRow } from '../../src/ui/TrainRow.tsx';
import { radius, space, typo, useTheme } from '../../src/theme.ts';
import type { Train } from '../../src/model.ts';

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

  const calendar = useMemo(() => buildCalendar(bundle.latest), [bundle.latest]);

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

  /** Une entree posee sur ce train precis, par opposition a une regle qui le couvre. */
  const isWatchedExactly = (depart: string) =>
    bundle.watchlist.watch.some(
      (entry) => entry.date === date && entry.dir === dir && entry.after === depart,
    );

  /**
   * Surveiller un train depuis son balayage.
   *
   * La fenetre est fermee des deux cotes sur l'heure de depart : avec le seul
   * `after`, l'entree se lirait « previens-moi pour tout train apres 06h06 » et
   * couvrirait la journee entiere. Le geste bascule, pour qu'une repetition ne
   * cree pas de doublon.
   *
   * Chaque ecriture emporte au passage les entrees dont le train est parti :
   * c'est le seul moment ou l'on ecrit deja, et la liste ne grandit donc jamais
   * pour rien.
   */
  /**
   * Surveiller la journee entiere.
   *
   * Une entree sans heure de depart couvre tous les trains de la date : c'est
   * ce qu'on veut quand n'importe quel horaire ferait l'affaire. Le format le
   * permettait depuis toujours, aucun ecran ne savait en poser une.
   */
  const watchedDay = bundle.watchlist.watch.some(
    (entry) => entry.date === date && entry.dir === dir && !entry.after,
  );

  const toggleWatchDay = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWatchlist(
      (current) =>
        pruneWatch(
          {
            ...current,
            watch: watchedDay
              ? current.watch.filter(
                  (entry) => !(entry.date === date && entry.dir === dir && !entry.after),
                )
              : [...current.watch, { date, dir }],
          },
          watchCutoff(),
        ),
      `watchlist: ${watchedDay ? 'retire' : 'surveille'} ${date}`,
    );
  };

  const toggleWatch = (depart: string) => {
    const watched = isWatchedExactly(depart);
    setWatchlist(
      (current) =>
        pruneWatch(
          {
            ...current,
            watch: watched
              ? current.watch.filter(
                  (entry) =>
                    !(entry.date === date && entry.dir === dir && entry.after === depart),
                )
              : [...current.watch, { date, dir, after: depart, before: depart }],
          },
          watchCutoff(),
        ),
      `watchlist: ${watched ? 'retire' : 'surveille'} ${date} ${depart}`,
    );
  };

  /**
   * Marquer ou demarquer une reservation.
   *
   * Le geste ne sert qu'a une chose : poser le rappel de confirmation. C'est la
   * seule information de reservation qu'on ne peut pas tenir de tete, et la
   * seule qui coute de l'argent quand elle manque — le rappel part du
   * telephone, pas d'une Action, et ne peut donc ni arriver en retard ni se
   * retirer en silence.
   *
   * Plus de blocage au sixieme creneau : le quota se suit de tete, et un geste
   * qui renvoyait en silence vers les reglages se lisait comme une panne.
   */
  const book = (train: Train) => {
    toggleBooking(
      setReservations,
      {
        date,
        dir,
        trainNo: train.trainNo,
        depart: train.depart,
        arrivee: train.arrivee,
        bookedAt: today,
        confirmed: false,
      },
      booked.has(train.trainNo),
    );
  };

  /*
   * Ecarter les trajets longs, plutot que les signaler.
   *
   * Sur cet axe les temps vont de 2h05 a 3h30 pour exactement le meme prix : un
   * omnibus reste reservable sans jamais etre un bon choix. Le besoin dit
   * « ecarter », et l'ecran ne savait que colorer. Le compteur du bandeau, lui,
   * continue de compter la journee entiere — masquer des lignes ne doit pas
   * changer ce que la journee contient.
   */
  const [hideLong, setHideLong] = useState(false);
  const longCount = useMemo(
    () => day.trains.filter((train) => train.tier === 'long').length,
    [day.trains],
  );
  const shown = useMemo(
    () => (hideLong ? day.trains.filter((train) => train.tier !== 'long') : day.trains),
    [day.trains, hideLong],
  );

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
        data={shown}
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
                  <Text style={[typo.strong, { color: theme.text }]}>
                    tous sur des trajets de plus de 3 h
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

            <Pressable
              onPress={toggleWatchDay}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: watchedDay ? theme.inverseBg : theme.sunken,
                  borderRadius: radius.pill,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[typo.strong, { color: watchedDay ? theme.inverseText : theme.muted }]}
              >
                {watchedDay ? 'journée suivie' : 'surveiller toute la journée'}
              </Text>
            </Pressable>

            {longCount > 0 && (
              <Pressable
                onPress={() => setHideLong((current) => !current)}
                style={({ pressed }) => [
                  styles.filter,
                  {
                    backgroundColor: hideLong ? theme.inverseBg : theme.sunken,
                    borderRadius: radius.pill,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[typo.strong, { color: hideLong ? theme.inverseText : theme.muted }]}
                >
                  {hideLong
                    ? `${longCount} trajet${longCount > 1 ? 's' : ''} de plus de 3 h masqué${longCount > 1 ? 's' : ''}`
                    : `masquer les ${longCount} trajet${longCount > 1 ? 's' : ''} de plus de 3 h`}
                </Text>
              </Pressable>
            )}

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
            onBook={() => book(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={[typo.body, styles.empty, { color: theme.muted }]}>
            {day.trains.length > 0
              ? 'Tous les trains de ce jour dépassent 3 h.'
              : 'Aucun train connu pour ce jour.'}
          </Text>
        }
        ListFooterComponent={
          shown.length === 0 ? null : (
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
  filter: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, marginTop: space.sm },
  forecast: { padding: space.md, marginTop: space.md, overflow: 'hidden', lineHeight: 18 },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  hint: { textAlign: 'center', paddingTop: space.md },
});
