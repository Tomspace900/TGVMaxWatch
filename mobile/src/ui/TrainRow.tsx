import { StyleSheet, Text, View } from 'react-native';
import { isNotable, traceVerdict, verdictLabel } from '../../../src/trace.ts';
import { formatDuration } from '../format.ts';
import type { Train } from '../model.ts';
import { RailSpine, SPINE_WIDTH } from './rail.tsx';
import { SwipeRow } from './SwipeRow.tsx';
import { Trace } from './Trace.tsx';
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
   * Le verdict ne parait que sur les deux cas qui decident : un train qui vient
   * de rouvrir, et un train qui bascule sans arret. Sur trente-cinq lignes, un
   * signal present partout est un fond. Le passe recent, lui, se lit en continu
   * dans la frise a droite.
   */
  const verdict = traceVerdict(trace);
  const dim = !train.available;
  const long = train.tier === 'long';

  /*
   * La ligne est accrochee a une voie qui court sur toute la liste.
   *
   * L'espacement entre deux cartes est un `paddingBottom` du conteneur et non
   * une marge de la carte : la voie doit couvrir cet intervalle, sinon elle se
   * coupe a chaque rangee. Elle reste hors du `SwipeRow`, pour ne pas partir
   * avec la carte quand le doigt l'ecarte — c'est du decor fixe, la carte seule
   * se deplace.
   */
  return (
    <View style={styles.wrap}>
      <RailSpine />

      <View style={{ marginLeft: SPINE_WIDTH }}>
        <SwipeRow
          left={{ label: watched ? 'NE PLUS SUIVRE' : 'SUIVRE', onAction: onWatch }}
          right={{ label: booked ? 'PLUS RÉSERVÉ' : "J'AI RÉSERVÉ", onAction: onBook }}
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
              {train.carrier && (
                <Text style={[typo.chip, styles.chip, { color: theme.muted, backgroundColor: theme.sunken }]}>
                  {train.carrier}
                </Text>
              )}
              <WatchedChip watched={watched} booked={booked} />
              {long && (
                <Text
                  style={[
                    typo.chip,
                    styles.chip,
                    styles.outline,
                    { color: theme.amber, borderColor: theme.amber, backgroundColor: theme.amberSoft },
                  ]}
                >
                  LONG
                </Text>
              )}
              {isNotable(verdict) && (
                <Text style={[typo.chip, styles.chip, styles.outline, { color: theme.text, borderColor: theme.lineStrong }]}>
                  {verdictLabel(verdict).toUpperCase()}
                </Text>
              )}
              <Text style={[typo.digits, { color: theme.muted, opacity: 0.75 }]}>
                {train.trainNo}
              </Text>
            </View>

            {/* La duree et le passe recent, empiles a droite : les deux
                s'alignent verticalement d'une ligne a l'autre, ce qui les rend
                comparables d'un coup d'oeil sur toute la liste. */}
            <View style={styles.right}>
              <Text style={[typo.digits, styles.duration, { color: dim ? theme.muted : theme.text }]}>
                {formatDuration(train.durationMin)}
              </Text>
              {trace && <Trace trace={trace} />}
            </View>
          </View>
        </SwipeRow>
      </View>
    </View>
  );
}

/**
 * Deux etats de l'utilisateur, deux registres distincts.
 *
 * « Suivi » dit « je regarde », « reserve » dit « c'est a moi » : les rendre
 * identiques obligeait a lire le mot pour les distinguer. L'accent revient donc
 * sur la reservation, et sur elle seule — c'est le registre de la carte de
 * confirmation et du bandeau de panne : ce qui t'engage ou te concerne, jamais
 * une mesure.
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
  wrap: { paddingBottom: space.sm },
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
  meta: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs + 1 },
  chip: {
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  outline: { borderWidth: 1 },
  right: { alignItems: 'flex-end' },
  duration: { minWidth: 40, textAlign: 'right' },
});
