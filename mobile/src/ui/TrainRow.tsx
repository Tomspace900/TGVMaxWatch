import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { formatDuration } from '../format.ts';
import type { Train } from '../model.ts';
import { Trace } from './Trace.tsx';
import { Wash } from './rail.tsx';
import { motion, radius, space, typo, useTheme } from '../theme.ts';

/** Distance a partir de laquelle l'action est validee au relachement. */
const THRESHOLD = 88;
const MAX_TRAVEL = 150;

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
  const dx = useSharedValue(0);
  const armed = useSharedValue(false);

  const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const confirm = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      dx.value = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, event.translationX));

      // Retour haptique au franchissement du seuil, pas en continu.
      const past = Math.abs(dx.value) >= THRESHOLD;
      if (past !== armed.value) {
        armed.value = past;
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      if (Math.abs(dx.value) >= THRESHOLD) {
        runOnJS(confirm)();
        runOnJS(dx.value < 0 ? onWatch : onBook)();
      }
      armed.value = false;
      dx.value = withSpring(0, motion.snap);
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  // L'action se revele progressivement sous le doigt, elle n'apparait pas d'un
  // coup a la fin du geste.
  const action = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dx.value), [0, THRESHOLD], [0, 1], 'clamp'),
  }));
  const leftAction = useAnimatedStyle(() => ({ opacity: dx.value < 0 ? 1 : 0 }));
  const rightAction = useAnimatedStyle(() => ({ opacity: dx.value > 0 ? 1 : 0 }));

  const dim = !train.available;

  return (
    <View style={[styles.wrap, { borderRadius: radius.sm }]}>
      {/* Le degrade identitaire ne se montre qu'ici : sous le doigt, quand la
          ligne s'ecarte. Nulle part il ne recouvre une donnee. */}
      <Animated.View style={[styles.actions, action]}>
        <Wash />
        <Animated.Text style={[typo.chip, styles.actionText, rightAction, { color: theme.onBrand }]}>
          J'AI RÉSERVÉ
        </Animated.Text>
        <Animated.Text style={[typo.chip, styles.actionText, leftAction, { color: theme.onBrand }]}>
          SURVEILLER
        </Animated.Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.row,
            row,
            {
              backgroundColor: dim ? theme.sunken : theme.raised,
              borderRadius: radius.sm,
              borderColor: theme.line,
            },
          ]}
        >
          {/* Un train de plus de 3h reste reservable et ne disparait jamais,
              mais il doit se voir immediatement comme un mauvais choix. */}
          {train.tier === 'long' && (
            <View style={[styles.longBar, { backgroundColor: theme.accent }]} />
          )}

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
              {/* Ni l'un ni l'autre ne prend l'echelle de disponibilite : ce
                  sont des etats de l'utilisateur, pas une mesure. */}
              {watched && (
                <Text style={[typo.chip, styles.chip, { color: theme.inverseText, backgroundColor: theme.inverseBg }]}>
                  SUIVI
                </Text>
              )}
              {booked && (
                <Text style={[typo.chip, styles.chip, { color: theme.onBrand, backgroundColor: theme.accent }]}>
                  RÉSERVÉ
                </Text>
              )}
              <Text style={[typo.digits, { color: theme.muted, opacity: 0.75 }]}>
                {train.trainNo}
              </Text>
            </View>
            {trace && <Trace trace={trace} />}
          </View>

          <Text
            style={[
              typo.digits,
              styles.duration,
              { color: train.tier === 'long' ? theme.accent : dim ? theme.muted : theme.text },
            ]}
          >
            {formatDuration(train.durationMin)}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', marginBottom: space.sm },
  actions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  actionText: { fontSize: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  longBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
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
