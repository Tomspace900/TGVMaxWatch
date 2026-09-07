import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CONFIRM_DEADLINE_HOUR,
  CONFIRM_URL,
  CONFIRM_WINDOW_HOURS,
} from '../../../src/config.ts';
import {
  confirmDeadline,
  departureInstant,
  dirLabel,
  longDate,
  untilLabel,
} from '../format.ts';
import { radius, space, typo, useTheme } from '../theme.ts';
import type { Reservation, Reservations } from '../../../src/types.ts';

/**
 * Les cartes de l'écran calendrier.
 *
 * Le suivi du quota de six réservations simultanées a disparu d'ici. Ce
 * nombre-là se tient de tête, et la jauge occupait la surface la plus visible
 * de l'écran pour dire ce que son propriétaire savait déjà. Ce qui reste des
 * réservations, c'est la seule chose qu'on ne peut pas tenir de tête et qui
 * coûte de l'argent quand on l'oublie : l'échéance de confirmation.
 */

/** Un créneau à confirmer, avec l'instant qui décide. */
interface Pending {
  slot: Reservation;
  deadline: Date;
}

/**
 * Les confirmations réellement possibles, maintenant.
 *
 * La fenêtre n'ouvre que 48 h avant le départ : avant, la confirmation n'est
 * pas disponible et la carte demanderait un geste qu'on ne peut pas faire. Elle
 * se referme au départ du train — après, il n'y a plus rien à confirmer, et une
 * carte qui reste est une carte qu'on cesse de voir.
 *
 * La borne est prise sur le **départ**, pas sur l'échéance : c'est le départ qui
 * ouvre le droit de confirmer, l'échéance ne fait que dire jusqu'à quand.
 */
function pendingConfirmations(reservations: Reservations): Pending[] {
  const now = Date.now();
  const opens = now + CONFIRM_WINDOW_HOURS * 3_600_000;

  return reservations.slots
    .filter((slot) => {
      if (slot.confirmed) return false;
      const departure = departureInstant(slot.date, slot.depart).getTime();
      return departure > now && departure <= opens;
    })
    .map((slot) => ({ slot, deadline: confirmDeadline(slot.date) }))
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

/**
 * L'échéance de confirmation.
 *
 * C'est le seul endroit où cette application peut coûter de l'argent réel : une
 * réservation MAX JEUNE non confirmée avant l'heure limite, la veille, est
 * perdue. Elle ne vivait jusqu'ici que dans une alarme locale et dans un écran
 * de réglages — c'est-à-dire nulle part au moment où elle compte.
 *
 * Ne rend rien tant que rien n'est urgent : une carte qui est toujours là ne
 * prévient de rien.
 */
export function ConfirmCard({
  reservations,
  onConfirm,
}: {
  reservations: Reservations;
  onConfirm: (slot: Reservation) => void;
}) {
  const theme = useTheme();

  const pending = pendingConfirmations(reservations);
  const first = pending[0];
  if (!first) return null;

  const late = first.deadline.getTime() <= Date.now();
  const others = pending.filter((entry) => entry !== first).length;

  return (
    <View style={[styles.card, styles.urgent, { backgroundColor: theme.accent }]}>
      <View style={styles.head}>
        <Text style={[typo.chip, { color: theme.onBrand }]}>
          {late ? 'ÉCHÉANCE DÉPASSÉE' : 'À CONFIRMER'}
        </Text>
        <Text style={[typo.digits, { color: theme.onBrand }]}>
          {untilLabel(first.deadline)}
        </Text>
      </View>

      <Text style={[typo.title, { color: theme.onBrand }]}>
        {first.slot.depart} · {longDate(first.slot.date)}
      </Text>
      <Text style={[typo.small, { color: theme.onBrand, opacity: 0.85 }]}>
        {dirLabel(first.slot.dir)} · avant {CONFIRM_DEADLINE_HOUR}h la veille
        {others > 0 ? ` · ${others} autre${others > 1 ? 's' : ''} en attente` : ''}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => void Linking.openURL(CONFIRM_URL)}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.onBrand, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[typo.section, { color: theme.accent }]}>Confirmer</Text>
        </Pressable>

        <Pressable
          onPress={() => onConfirm(first.slot)}
          style={({ pressed }) => [
            styles.button,
            styles.ghost,
            { borderColor: theme.onBrand, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[typo.section, { color: theme.onBrand }]}>C'est fait</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Accès à l'érosion, publiée seulement quand l'archive couvre une arche entière. */
export function StatsCard({
  snapshotCount,
  onPress,
}: {
  snapshotCount: number;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[typo.section, { color: theme.text }]}>Érosion et prévisions</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>{snapshotCount} j</Text>
      </View>
      <Text style={[typo.small, { color: theme.muted }]}>
        Ce que la source ne garde pas : la vitesse à laquelle une date se vide.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  urgent: { borderWidth: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  ghost: { backgroundColor: 'transparent', borderWidth: 1 },
});
