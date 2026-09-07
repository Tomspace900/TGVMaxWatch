import { StyleSheet, Text, View } from 'react-native';
import { isNotable, traceVerdict, verdictLabel } from '../../../src/trace.ts';
import { formatDuration } from '../format.ts';
import type { Train } from '../model.ts';
import { SwipeRow } from './SwipeRow.tsx';
import { radius, space, typo, useTheme } from '../theme.ts';

interface Props {
  train: Train;
  watched: boolean;
  booked: boolean;
  /** Disponibilite jour apres jour, absente tant que l'archive est trop courte. */
  trace?: string;
  onWatch: () => void;
  onBook: () => void;
}

export function TrainRow({ train, watched, booked, trace, onWatch, onBook }: Props) {
  const theme = useTheme();

  /*
   * L'archive ne sort que quand elle change une decision.
   *
   * Une frise de trente cellules par ligne, sur trente-cinq lignes, demandait
   * une legende permanente et pres de mille vues pour dire, la plupart du
   * temps, « ouvert, comme hier ». Le verdict ne parait donc que sur les deux
   * cas qui decident : un train qui vient de rouvrir, et un train qui bascule
   * sans arret. Le reste se lit dans l'ecran de surveillance, ou l'on regarde
   * six lignes et non trente-cinq.
   */
  const verdict = traceVerdict(trace);
  const dim = !train.available;

  return (
    <View style={styles.wrap}>
      <SwipeRow
        left={{ label: watched ? 'NE PLUS SUIVRE' : 'SURVEILLER', onAction: onWatch }}
        right={{ label: "J'AI RÉSERVÉ", onAction: onBook }}
      >
        <View
          style={[
            styles.row,
            {
              backgroundColor: dim ? theme.sunken : theme.raised,
              borderRadius: radius.sm,
              borderColor: theme.line,
            },
          ]}
        >
          <View style={styles.times}>
            <Text
              style={[typo.clock, { color: dim ? theme.muted : theme.text }, dim && styles.struck]}
            >
              {train.depart}
            </Text>
            <Text style={[typo.digits, { color: theme.muted }]}>{train.arrivee}</Text>
          </View>

          <View style={styles.meta}>
            <View style={styles.chips}>
              {train.carrier && (
                <Text style={[typo.chip, styles.chip, { color: theme.muted, backgroundColor: theme.sunken }]}>
                  {train.carrier}
                </Text>
              )}
              <WatchedChip watched={watched} booked={booked} />
              <Text style={[typo.digits, { color: theme.muted, opacity: 0.75 }]}>
                {train.trainNo}
              </Text>
              {isNotable(verdict) && (
                <Text style={[typo.chip, styles.chip, { color: theme.text, borderColor: theme.lineStrong, borderWidth: 1 }]}>
                  {verdictLabel(verdict).toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* Un trajet long n'est pas une anomalie a signaler : sur cet axe,
              c'est un mauvais choix par defaut, et un quart des trains ouverts
              depassent trois heures. Le chiffre suffit ; pour les ecarter, il y
              a un filtre. */}
          <Text style={[typo.digits, styles.duration, { color: dim ? theme.muted : theme.text }]}>
            {formatDuration(train.durationMin)}
          </Text>
        </View>
      </SwipeRow>
    </View>
  );
}

/**
 * Deux etats de l'utilisateur, deux registres distincts.
 *
 * « Suivi » dit « je regarde », « reserve » dit « c'est a moi » : les rendre
 * identiques obligeait a lire le mot pour les distinguer. L'accent revient donc
 * sur la reservation, et sur elle seule — c'est le meme registre que la carte
 * de confirmation et que le bandeau de panne : ce qui t'engage ou te concerne,
 * jamais une mesure.
 */
export function WatchedChip({ watched, booked }: { watched: boolean; booked: boolean }) {
  const theme = useTheme();

  if (booked) {
    return (
      <Text style={[typo.chip, styles.chip, { color: theme.onBrand, backgroundColor: theme.accent }]}>
        RÉSERVÉ
      </Text>
    );
  }
  if (watched) {
    return (
      <Text
        style={[typo.chip, styles.chip, { color: theme.inverseText, backgroundColor: theme.inverseBg }]}
      >
        SUIVI
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Depart et arrivee empiles : deux horaires sur une ligne se lisent comme un
  // seul nombre coupe en deux.
  times: { alignItems: 'flex-start', gap: 1 },
  struck: { textDecorationLine: 'line-through' },
  meta: { flex: 1, gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs + 2 },
  chip: {
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  duration: { minWidth: 40, textAlign: 'right' },
});
