import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DIRECTIONS, HORIZON_DAYS } from '../../../src/config.ts';
import { addDays, todayInParis, weekday } from '../../../src/dates.ts';
import { trainsWord } from '../../../src/label.ts';
import { DAY_PERIODS } from '../../../src/periods.ts';
import { slotOf } from '../../../src/stats.ts';
import { hasWatch, matchesWatchlist, pruneWatch, setWatch } from '../../../src/watchlist.ts';
import { useStore } from '../../src/data/store.ts';
import { toggleBooking } from '../../src/data/booking.ts';
import { buildCalendar, emptyDay } from '../../src/model.ts';
import { dirLabel, longDate, watchCutoff } from '../../src/format.ts';
import { Sparkline } from '../../src/ui/Sparkline.tsx';
import { BAR_HEIGHT, StickyBar } from '../../src/ui/StickyBar.tsx';
import { TrainRow } from '../../src/ui/TrainRow.tsx';
import { radius, space, typo, useTheme } from '../../src/theme.ts';
import type { Train } from '../../src/model.ts';
import type { WatchEntry } from '../../../src/types.ts';

const TrainList = Animated.FlatList<Train>;

/**
 * Ce qu'on peut retirer de la liste d'une journee.
 *
 * Trois categories, trois predicats, un seul endroit ou les nommer : ajouter un
 * filtre ne doit pas demander de retoucher trois expressions dispersees dans le
 * rendu.
 */
const FILTERS = {
  ouigo: (train: Train) => train.carrier === 'OUIGO',
  long: (train: Train) => train.tier === 'long',
  closed: (train: Train) => !train.available,
} as const;

type FilterKey = keyof typeof FILTERS;

const FILTER_KEYS = ['ouigo', 'long', 'closed'] as const satisfies readonly FilterKey[];

const FILTER_LABELS: Record<FilterKey, string> = {
  ouigo: 'OUIGO',
  long: 'longs',
  closed: 'complets',
};

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

  /**
   * Une entree de suivi posee sur cette date et ce sens, avec cette fenetre.
   *
   * L'egalite porte sur les bornes, pas sur ce qu'elles couvrent : suivre « le
   * matin » et suivre le train de 07h12 sont deux entrees distinctes, et
   * retirer l'une ne doit pas emporter l'autre.
   */
  const watchedWindow = (after?: string, before?: string) =>
    hasWatch(bundle.watchlist, entryFor(after, before));

  const entryFor = (after?: string, before?: string): WatchEntry => ({
    date,
    dir,
    ...(after ? { after } : {}),
    ...(before ? { before } : {}),
  });

  /**
   * Poser ou retirer un suivi sur cette date.
   *
   * Une seule fonction pour les trois formes : un train precis (fenetre fermee
   * sur son heure), une periode de la journee, ou la journee entiere (aucune
   * borne). Elles ne different que par la fenetre — les separer en trois gestes
   * aurait fait trois occasions de diverger.
   *
   * Chaque ecriture emporte au passage les entrees dont le train est parti :
   * c'est le seul moment ou l'on ecrit deja, et la liste ne grandit donc jamais
   * pour rien.
   */
  const toggleWatchWindow = (after?: string, before?: string, label = 'la journee') => {
    const already = watchedWindow(after, before);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setWatchlist(
      (current) => pruneWatch(setWatch(current, entryFor(after, before), !already), watchCutoff()),
      `watchlist: ${already ? 'retire' : 'suit'} ${date} ${label}`,
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
  /*
   * Trois facons d'alleger la liste, et un seul defaut actif.
   *
   * **OUIGO est masque d'office** parce qu'il n'est jamais eligible : mesure sur
   * l'archive complete, 1 916 rames OUIGO et **zero** ouverte — MAX JEUNE ne
   * couvre pas OUIGO, c'est structurel. Ce n'est pas cacher de l'information,
   * c'est retirer un septieme de la liste qu'on ne peut de toute facon pas
   * prendre ; et la pastille reste affichee, active et comptee, pour que rien ne
   * disparaisse en silence.
   *
   * Les longs et les complets restent visibles : un train complet qui existe est
   * une information, et un omnibus reste reservable. Les masquer d'office
   * retirerait des trains que personne n'a demande a ne plus voir.
   */
  const [hidden, setHidden] = useState<Record<FilterKey, boolean>>({
    ouigo: true,
    long: false,
    closed: false,
  });

  const counts = useMemo(
    () => ({
      ouigo: day.trains.filter(FILTERS.ouigo).length,
      long: day.trains.filter(FILTERS.long).length,
      closed: day.trains.filter(FILTERS.closed).length,
    }),
    [day.trains],
  );

  const shown = useMemo(
    () =>
      day.trains.filter((train) =>
        FILTER_KEYS.every((key) => !hidden[key] || !FILTERS[key](train)),
      ),
    [day.trains, hidden],
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

            {/* Suivre un moment de la journee plutot qu'un train : c'est la
                maille a laquelle on decide un deplacement — « je descends
                vendredi soir », pas « je prends le 19h04 ». */}
            <Text style={[typo.chip, { color: theme.muted, marginTop: space.lg }]}>SUIVRE</Text>
            <View style={styles.pills}>
              <Pill
                label="toute la journée"
                active={watchedWindow()}
                onPress={() => toggleWatchWindow()}
              />
              {DAY_PERIODS.map((period) => (
                <Pill
                  key={period.key}
                  label={period.label}
                  active={watchedWindow(period.after, period.before)}
                  onPress={() => toggleWatchWindow(period.after, period.before, period.label)}
                />
              ))}
            </View>

            {/* La contrepartie de « suivre » : deux rangees construites pareil,
                l'une qui ajoute au suivi, l'autre qui retire de la liste. */}
            {FILTER_KEYS.some((key) => counts[key] > 0) && (
              <>
                <Text style={[typo.chip, { color: theme.muted, marginTop: space.lg }]}>
                  MASQUER
                </Text>
                <View style={styles.pills}>
                  {FILTER_KEYS.filter((key) => counts[key] > 0).map((key) => (
                    <Pill
                      key={key}
                      label={`${FILTER_LABELS[key]} · ${counts[key]}`}
                      active={hidden[key]}
                      onPress={() => setHidden((current) => ({ ...current, [key]: !current[key] }))}
                    />
                  ))}
                </View>
              </>
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
            onWatch={() => toggleWatchWindow(item.depart, item.depart, item.depart)}
            onBook={() => book(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={[typo.body, styles.empty, { color: theme.muted }]}>
            {day.trains.length > 0
              ? 'Tous les trains de ce jour sont masqués par les filtres.'
              : 'Aucun train connu pour ce jour.'}
          </Text>
        }
        ListFooterComponent={
          shown.length === 0 ? null : (
            <Text style={[typo.small, styles.hint, { color: theme.muted }]}>
              Glisser vers la gauche pour suivre, vers la droite après avoir réservé.
              {'\n'}À droite de chaque ligne, les sept derniers jours de collecte : plein = ouvert
              au TGVmax.
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

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? theme.inverseBg : theme.sunken,
          borderRadius: radius.pill,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typo.strong, { color: active ? theme.inverseText : theme.muted }]}>
        {label}
      </Text>
    </Pressable>
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  pill: { paddingHorizontal: 12, paddingVertical: 7 },
  forecast: { padding: space.md, marginTop: space.md, overflow: 'hidden', lineHeight: 18 },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  hint: { textAlign: 'center', paddingTop: space.md },
});
