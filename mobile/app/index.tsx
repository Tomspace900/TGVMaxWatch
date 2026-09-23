import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { DIRECTIONS, STALE_ALARM_HOURS, STALE_DATA_HOURS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useStore } from '../src/data/store.ts';
import { openBooking, toggleBooking } from '../src/data/booking.ts';
import { cancelConfirmReminder } from '../src/data/reminders.ts';
import { bookableTrainNo } from '../../src/departures.ts';
import { buildCalendar, type Train } from '../src/model.ts';
import { ageLabel, dirLabel, hoursSince, longDate, reverseDir, watchCutoff } from '../src/format.ts';
import { BookingList } from '../src/ui/BookingList.tsx';
import { ConfirmCard, StatsCard } from '../src/ui/Cards.tsx';
import { CalendarPager } from '../src/ui/CalendarPager.tsx';
import { RailTrack } from '../src/ui/rail.tsx';
import { Segmented } from '../src/ui/Segmented.tsx';
import { UndoBar, useUndo } from '../src/ui/UndoBar.tsx';
import { WatchList } from '../src/ui/WatchList.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';
import { watchLabel } from '../../src/label.ts';
import { pruneWatch, setWatch } from '../../src/watchlist.ts';
import type { Reservation, Watch } from '../../src/types.ts';

export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, loading, offline, storageOk, refresh, setReservations, setWatchlist } = useStore();

  const today = useMemo(() => todayInParis(), []);
  const calendar = useMemo(() => buildCalendar(bundle.latest), [bundle.latest]);

  /*
   * Les jours deja reserves, pour que le calendrier les marque.
   *
   * La cle porte le sens : un aller reserve le 12 ne doit pas faire croire a un
   * retour reserve le meme jour dans l'autre panneau.
   */
  const bookedDays = useMemo(
    () => new Set(bundle.reservations.slots.map((slot) => `${slot.date}|${slot.dir}`)),
    [bundle.reservations.slots],
  );

  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const undo = useUndo();

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

  /*
   * Chaque retrait s'annonce et se defait : un defaire, jamais une
   * confirmation — le geste *est* l'interface. `setWatch` retire avant
   * d'ajouter, donc remettre est idempotent.
   */
  const removeWatch = (target: Watch) => {
    setWatchlist((current) => pruneWatch(setWatch(current, target, false), watchCutoff()));
    undo.offer({
      label: `${watchLabel(target)} n'est plus suivi`,
      undo: () => setWatchlist((current) => pruneWatch(setWatch(current, target, true), watchCutoff())),
    });
  };

  const book = (date: string, bookedDir: string, train: Train, booked: boolean) => {
    const slot: Reservation = {
      date,
      dir: bookedDir,
      trainNo: bookableTrainNo(train),
      depart: train.depart,
      arrivee: train.arrivee,
      bookedAt: today,
      confirmed: false,
    };
    // Seul le retrait se defait : ajouter une reservation ne perd rien, et une
    // barre a chaque geste redeviendrait un fond. Le retrait passe par `cancel`
    // plutot que d'ecrire ici, sinon le meme geste ferait deux ecritures.
    if (booked) cancel(slot);
    else {
      toggleBooking(setReservations, slot, false);
      // Le meme geste doit faire la meme chose sur les deux ecrans qui le
      // portent, sans quoi on cesse de l'essayer sur celui qui hesite.
      openBooking();
    }
  };

  /** Retrait d'une reservation, d'ou qu'il vienne : une seule formulation. */
  const cancel = (slot: Reservation) => {
    toggleBooking(setReservations, slot, true);
    undo.offer({
      label: `${longDate(slot.date)} ${slot.depart} n'est plus réservé`,
      undo: () => toggleBooking(setReservations, slot, false),
    });
  };

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
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + space.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.muted}
            progressViewOffset={insets.top}
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

        {/* Une panne du stockage local est la seule perte irreversible que cette
            application puisse causer, et le seul endroit ou la donnee n'est pas
            reconstituable depuis l'archive. Elle vivait dans l'ecran de
            reglages, avec la liste des reservations ; celle-ci ayant demenage,
            l'avertissement suit — il doit etre la ou l'on ecrit. */}
        {!storageOk && (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.accent, marginHorizontal: space.lg, borderRadius: radius.sm },
            ]}
          >
            <Text style={[typo.strong, { color: theme.onBrand, lineHeight: 18 }]}>
              Le stockage de cet appareil est illisible. Rien n'est enregistré tant que ce n'est pas
              résolu — restaure une sauvegarde ou réinstalle l'application.
            </Text>
          </View>
        )}

        {/* Le seul endroit ou cette application peut couter de l'argent reel :
            au-dessus de tout le reste, et seulement quand c'est vrai. */}
        <View style={{ paddingHorizontal: space.lg }}>
          <ConfirmCard reservations={bundle.reservations} onConfirm={markConfirmed} />
        </View>

        {/* Ce qu'on vient chercher est en haut.
            Le suivi repond a la question de la session de trente
            secondes — « mon creneau, ou en est-il ? » — et se trouvait apres
            trente cases de calendrier. Le calendrier sert a *trouver* une date,
            ce qui vient ensuite dans l'ordre du besoin, pas avant. */}
        <WatchList
          watchlist={bundle.watchlist}
          calendar={calendar}
          trains={bundle.trains}
          reservations={bundle.reservations}
          today={today}
          onOpen={(date, selectedDir) =>
            router.push({ pathname: '/day/[date]', params: { date, dir: selectedDir } })
          }
          onCreate={() => router.push('/watch')}
          onRemove={removeWatch}
          onBook={book}
        />

        <View style={{ marginTop: space.lg }}>
          <BookingList
            reservations={bundle.reservations}
            today={today}
            onOpen={(date, selectedDir) =>
              router.push({ pathname: '/day/[date]', params: { date, dir: selectedDir } })
            }
            onCancel={cancel}
          />
        </View>

        <RailTrack style={{ marginTop: space.lg, marginHorizontal: space.lg }} />

        {/* Le selecteur de sens vit avec ce qu'il gouverne.
            Il etait epingle en haut de l'ecran, ou il surplombait desormais un
            bloc qu'il ne filtre pas — chaque ligne de suivi porte son
            propre sens. Et il n'y avait rien a gagner a l'epingler : la grille
            fait cinq rangees, il reste visible tout le temps qu'on la regarde.
            La barre fixe garde son sens sur l'ecran d'un jour, ou la liste fait
            trente-cinq lignes. */}
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <Segmented
            labels={DIRECTIONS.map(dirLabel)}
            index={index}
            progress={progress}
            onChange={setIndex}
          />
        </View>

        <View style={{ marginTop: space.md }}>
          <CalendarPager
            calendar={calendar}
            today={today}
            directions={DIRECTIONS}
            index={index}
            booked={bookedDays}
            progress={progress}
            onIndexChange={setIndex}
            onSelect={(date, selectedDir) =>
              router.push({ pathname: '/day/[date]', params: { date, dir: selectedDir } })
            }
          />
        </View>

        {/* La carte reste, prete ou non : c'est elle qui dit ce qui manque, et
            elle est le seul chemin vers l'ecran qui l'explique. */}
        <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
          <StatsCard
            snapshotCount={bundle.state.snapshotCount}
            onPress={() => router.push('/history')}
          />
        </View>
      </Animated.ScrollView>

      {/* Hors du defilement : un defaire qui part avec le doigt qui fait
          defiler ne serait pas un defaire. */}
      <UndoBar action={undo.action} onDismiss={undo.dismiss} />
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
