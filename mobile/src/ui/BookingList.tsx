import { useMemo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CONFIRM_DEADLINE_HOUR, CONFIRM_WINDOW_HOURS } from '../../../src/config.ts';
import { daysBetween } from '../../../src/dates.ts';
import { isExpired } from '../../../src/watchlist.ts';
import { departureInstant, dirLabel, longDate, watchCutoff } from '../format.ts';
import { SwipeRow } from './SwipeRow.tsx';
import { radius, space, typo, useTheme } from '../theme.ts';
import type { Reservation, Reservations } from '../../../src/types.ts';

/**
 * Ce qui est reserve, et rien de plus.
 *
 * Cette liste vivait dans les reglages, avec des boutons « confirme » et
 * « liberer » — c'est-a-dire loin de l'endroit ou l'on se trouve quand ces
 * gestes comptent. Elle remonte ici, avec le meme balayage que partout
 * ailleurs, et les reglages redeviennent des reglages.
 *
 * Les voyages passes n'y paraissent pas : ils ne demandent plus rien. Ils
 * restent en revanche dans le stockage et dans l'export — effacer une donnee
 * utilisateur en silence est exactement ce qui a deja coute une reservation a
 * ce projet.
 */

interface Props {
  reservations: Reservations;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onCancel: (slot: Reservation) => void;
}

export function BookingList({ reservations, today, onOpen, onCancel }: Props) {
  const upcoming = useMemo(() => {
    const cutoff = watchCutoff();
    return reservations.slots
      .filter((slot) => !isExpired({ date: slot.date, after: slot.depart }, cutoff))
      .sort((a, b) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart));
  }, [reservations.slots]);

  const theme = useTheme();
  if (upcoming.length === 0) return null;

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={[typo.title, { color: theme.text }]}>Réservations</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>{upcoming.length}</Text>
      </View>

      {upcoming.map((slot) => (
        <Row
          key={`${slot.date}-${slot.dir}-${slot.trainNo}`}
          slot={slot}
          today={today}
          onOpen={onOpen}
          onCancel={onCancel}
        />
      ))}
    </View>
  );
}

function Row({
  slot,
  today,
  onOpen,
  onCancel,
}: {
  slot: Reservation;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onCancel: (slot: Reservation) => void;
}) {
  const theme = useTheme();
  const left = daysBetween(today, slot.date);

  /*
   * Dire pourquoi on ne peut pas encore confirmer.
   *
   * La confirmation n'ouvre que 48 h avant le depart. Sans cette ligne, une
   * reservation lointaine se lit comme une reservation en retard, et l'on va
   * chercher un bouton qui n'existe pas encore.
   */
  const openIn =
    (departureInstant(slot.date, slot.depart).getTime() - Date.now()) / 3_600_000 -
    CONFIRM_WINDOW_HOURS;
  const state = slot.confirmed
    ? 'confirmée'
    : openIn > 0
      ? `confirmation possible dans ${Math.ceil(openIn / 24)} j`
      : `à confirmer avant ${CONFIRM_DEADLINE_HOUR}h la veille`;

  return (
    <SwipeRow right={{ label: 'PLUS RÉSERVÉ', onAction: () => onCancel(slot) }}>
      <Pressable
        onPress={() => onOpen(slot.date, slot.dir)}
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
        <Text style={[typo.clock, styles.time, { color: theme.text }]}>{slot.depart}</Text>

        <View style={styles.body}>
          <View style={styles.line}>
            <Text style={[typo.section, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {longDate(slot.date)}
            </Text>
            <Text style={[typo.digits, { color: theme.muted }]}>
              {left === 0 ? "aujourd'hui" : `J-${left}`}
            </Text>
          </View>
          <Text
            style={[
              slot.confirmed ? typo.small : typo.strong,
              { color: slot.confirmed ? theme.muted : theme.text },
            ]}
            numberOfLines={1}
          >
            {dirLabel(slot.dir)} · {state}
          </Text>
        </View>
      </Pressable>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.lg, gap: space.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  time: { minWidth: 58 },
  body: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
