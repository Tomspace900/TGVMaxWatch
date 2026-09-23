import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, daysBetween } from '../../../src/dates.ts';
import { openTrainsLabel, watchLabel } from '../../../src/label.ts';
import { isNotable, traceVerdict, verdictLabel } from '../../../src/trace.ts';
import { covers, isTrainWatch } from '../../../src/watchlist.ts';
import { dirLabel, watchCutoff } from '../format.ts';
import type { Calendar, Train } from '../model.ts';
import { SwipeRow } from './SwipeRow.tsx';
import { WatchedChip } from './TrainRow.tsx';
import { radius, space, typo, useTheme } from '../theme.ts';
import type { Reservations, TrainTrends, Watch, Watchlist } from '../../../src/types.ts';

/**
 * Ce qui est suivi, en entier et en tete de l'ecran : un creneau ou un train
 * par ligne, avec ce qu'il vaut aujourd'hui.
 *
 * Les memes gestes que dans la liste d'un jour : vers la gauche pour ne plus
 * suivre, vers la droite apres avoir reserve un train.
 */

interface Props {
  watchlist: Watchlist;
  calendar: Calendar;
  trains: TrainTrends;
  reservations: Reservations;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onCreate: () => void;
  onRemove: (watch: Watch) => void;
  onBook: (date: string, dir: string, train: Train, booked: boolean) => void;
}

/** Les departs du releve qui tombent dans la fenetre, sur tous ses jours. */
function trainsIn(watch: Watch, calendar: Calendar): Train[] {
  const found: Train[] = [];
  const last = watch.to.slice(0, 10);
  for (let date = watch.from.slice(0, 10); date <= last; date = addDays(date, 1)) {
    for (const train of calendar.get(date)?.get(watch.dir)?.trains ?? []) {
      if (covers(watch, train)) found.push(train);
    }
  }
  return found;
}

export function WatchList({
  watchlist,
  calendar,
  trains,
  reservations,
  today,
  onOpen,
  onCreate,
  onRemove,
  onBook,
}: Props) {
  const theme = useTheme();

  // Ce qui est fini ne s'affiche plus ; le stockage, lui, se nettoie a la
  // prochaine ecriture.
  const shown = useMemo(() => {
    const cutoff = watchCutoff();
    return watchlist
      .filter((watch) => watch.to >= cutoff)
      .sort((a, b) => a.from.localeCompare(b.from));
  }, [watchlist]);

  const booked = useMemo(
    () => new Set(reservations.slots.map((slot) => `${slot.date}|${slot.dir}|${slot.trainNo}`)),
    [reservations.slots],
  );

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={[typo.title, { color: theme.text }]}>Suivi</Text>
        <Pressable
          onPress={onCreate}
          hitSlop={10}
          style={({ pressed }) => [
            styles.add,
            { backgroundColor: theme.sunken, borderRadius: radius.pill, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[typo.strong, { color: theme.text }]}>+ créneau</Text>
        </Pressable>
      </View>

      {shown.length === 0 && (
        <Text style={[typo.body, { color: theme.muted, lineHeight: 20 }]}>
          Rien de suivi : seules les alertes générales partiront. Pose un créneau ci-dessus, ou balaie
          un train vers la gauche depuis un jour.
        </Text>
      )}

      {shown.map((watch) => {
        const inside = trainsIn(watch, calendar);
        const date = watch.from.slice(0, 10);
        const left = daysBetween(today, date);
        const train = isTrainWatch(watch) ? inside[0] : undefined;
        const isBooked = Boolean(
          train?.trainNos.some((trainNo) => booked.has(`${date}|${watch.dir}|${trainNo}`)),
        );

        // Un train : est-ce que *ce train-la* tient. Une fenetre : combien il en reste.
        const verdict = train ? traceVerdict(trains.series[`${date}|${watch.dir}`]?.[train.depart]) : null;
        const state = train
          ? verdict && verdict.kind !== 'inconnu'
            ? verdictLabel(verdict)
            : train.available
              ? 'ouvert'
              : 'complet'
          : isTrainWatch(watch)
            ? 'plus au programme'
            : openTrainsLabel(inside.filter((item) => item.available).length);

        return (
          <SwipeRow
            key={`${watch.dir}|${watch.from}|${watch.to}|${watch.skipLong ? 1 : 0}`}
            left={{ label: 'NE PLUS SUIVRE', onAction: () => onRemove(watch) }}
            {...(train
              ? {
                  right: {
                    label: isBooked ? 'PLUS RÉSERVÉ' : "J'AI RÉSERVÉ",
                    onAction: () => onBook(date, watch.dir, train, isBooked),
                  },
                }
              : {})}
          >
            <Pressable
              onPress={() => onOpen(date, watch.dir)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.raised,
                  borderColor: theme.line,
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <View style={styles.body}>
                <View style={styles.line}>
                  <Text style={[typo.section, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                    {watchLabel(watch)}
                  </Text>
                  <WatchedChip watched={false} booked={isBooked} />
                  <Text style={[typo.digits, { color: theme.muted }]}>
                    {left <= 0 ? "aujourd'hui" : `J-${left}`}
                  </Text>
                </View>
                <Text
                  style={[
                    verdict && isNotable(verdict) ? typo.strong : typo.small,
                    { color: verdict && isNotable(verdict) ? theme.text : theme.muted },
                  ]}
                  numberOfLines={1}
                >
                  {dirLabel(watch.dir)} · {state}
                  {watch.skipLong ? ' · sans les longs' : ''}
                </Text>
              </View>
            </Pressable>
          </SwipeRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.lg, gap: space.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  add: { paddingHorizontal: 12, paddingVertical: 7 },
  // Le meme objet que dans la liste d'un jour : le meme geste, la meme forme.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  body: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
