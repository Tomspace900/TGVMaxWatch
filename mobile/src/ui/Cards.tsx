import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_RESERVATIONS } from '../../../src/config.ts';
import { dirLabel, longDate, weekdayName } from '../format.ts';
import type { Calendar } from '../model.ts';
import { radius, space, useTheme } from '../theme.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

/**
 * Les cartes du bas de l'écran calendrier.
 *
 * Sept colonnes de trente cases ne peuvent pas, géométriquement, remplir un
 * écran de téléphone. Plutôt que d'agrandir les cases jusqu'à l'absurde ou de
 * laisser un vide, le bas porte ce qui est toujours disponible et propre à
 * l'utilisateur : son quota et ce qu'il surveille.
 */
export function QuotaCard({
  reservations,
  onPress,
}: {
  reservations: Reservations;
  onPress: () => void;
}) {
  const theme = useTheme();
  const used = reservations.slots.length;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Réservations</Text>
        <Text style={[styles.muted, { color: theme.muted }]}>
          {used} sur {MAX_RESERVATIONS}
        </Text>
      </View>

      <View style={styles.slots}>
        {Array.from({ length: MAX_RESERVATIONS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.slot,
              { backgroundColor: i < used ? theme.avail[3] : theme.sunken },
            ]}
          />
        ))}
      </View>

      {used === 0 ? (
        <Text style={[styles.muted, { color: theme.muted }]}>
          Aucun créneau occupé. Balaie une ligne de train vers la droite après avoir réservé.
        </Text>
      ) : (
        reservations.slots.slice(0, 3).map((slot) => (
          <Text key={`${slot.date}-${slot.trainNo}`} style={[styles.row, { color: theme.text }]}>
            {slot.depart} · {longDate(slot.date)}
            <Text style={{ color: theme.muted }}>  {dirLabel(slot.dir)}</Text>
          </Text>
        ))
      )}
    </Pressable>
  );
}

export function WatchCard({
  watchlist,
  calendar,
  onPress,
}: {
  watchlist: Watchlist;
  calendar: Calendar;
  onPress: () => void;
}) {
  const theme = useTheme();
  const total = watchlist.watch.length + watchlist.rules.length;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Surveillance</Text>
        <Text style={[styles.muted, { color: theme.muted }]}>
          {total === 0 ? 'rien' : `${total} entrée${total > 1 ? 's' : ''}`}
        </Text>
      </View>

      {total === 0 && (
        <Text style={[styles.muted, { color: theme.muted }]}>
          Rien de surveillé : aucune alerte ne partira. Balaie un train vers la gauche pour le
          suivre.
        </Text>
      )}

      {watchlist.watch.slice(0, 3).map((entry) => {
        // La disponibilité vient du snapshot courant : voir « 0 » sur une date
        // surveillée est précisément l'information qu'on cherche.
        const day = entry.dir ? calendar.get(entry.date)?.get(entry.dir) : undefined;

        return (
          <View key={`${entry.date}-${entry.after ?? ''}`} style={styles.watchRow}>
            <Text style={[styles.row, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {longDate(entry.date)}
              {entry.after ? ` · ${entry.after}` : ''}
            </Text>
            {day && (
              <Text
                style={[
                  styles.badge,
                  {
                    color: theme.availInk[day.available > 0 ? 3 : 0],
                    backgroundColor: theme.avail[day.available > 0 ? 3 : 0],
                  },
                ]}
              >
                {day.available}
              </Text>
            )}
          </View>
        );
      })}

      {watchlist.rules.slice(0, 2).map((rule, index) => (
        <Text key={`rule-${index}`} style={[styles.row, { color: theme.muted }]}>
          chaque {weekdayName(rule.weekday)}
          {rule.after ? ` après ${rule.after}` : ''}
        </Text>
      ))}
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12.5, lineHeight: 18 },
  slots: { flexDirection: 'row', gap: space.xs + 2, marginVertical: space.xs },
  slot: { flex: 1, height: 22, borderRadius: radius.sm - 4 },
  row: { fontSize: 13.5, fontWeight: '500' },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
