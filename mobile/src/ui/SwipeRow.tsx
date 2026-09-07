import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Wash } from './rail.tsx';
import { motion, radius, space, typo, useTheme } from '../theme.ts';

/** Distance a partir de laquelle l'action est validee au relachement. */
const THRESHOLD = 88;
const MAX_TRAVEL = 150;

interface Props {
  /** Action du balayage vers la gauche. Absente, ce cote ne s'arme pas. */
  left?: { label: string; onAction: () => void };
  /** Action du balayage vers la droite. */
  right?: { label: string; onAction: () => void };
  children: ReactNode;
}

/**
 * Une ligne qu'on ecarte du doigt pour agir.
 *
 * Le geste vivait dans la ligne de train ; la liste des suivis le voulait
 * aussi, avec les memes seuils, la meme resistance et les memes retours
 * haptiques. Deux implementations du meme geste, c'est deux gestes a l'usage :
 * il suffit que l'une derive de dix pixels pour que la main sente la difference
 * sans savoir la nommer.
 *
 * Un cote sans action ne s'arme pas : la ligne suit le doigt et revient, sans
 * jamais promettre quelque chose qui n'arrivera pas.
 */
export function SwipeRow({ left, right, children }: Props) {
  const theme = useTheme();
  const dx = useSharedValue(0);
  const armed = useSharedValue(false);

  const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const confirm = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const wanted = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, event.translationX));
      // Un cote sans action garde un debattement, pas une promesse.
      const allowed = (wanted < 0 && !left) || (wanted > 0 && !right);
      dx.value = allowed ? wanted * 0.25 : wanted;

      // Retour haptique au franchissement du seuil, pas en continu.
      const past = !allowed && Math.abs(dx.value) >= THRESHOLD;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const action = dx.value < 0 ? left : right;
      if (action && Math.abs(dx.value) >= THRESHOLD) {
        runOnJS(confirm)();
        runOnJS(action.onAction)();
      }
      armed.value = false;
      dx.value = withSpring(0, motion.snap);
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  // L'action se revele progressivement sous le doigt, elle n'apparait pas d'un
  // coup a la fin du geste.
  const reveal = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dx.value), [0, THRESHOLD], [0, 1], 'clamp'),
  }));
  const leftSide = useAnimatedStyle(() => ({ opacity: dx.value < 0 ? 1 : 0 }));
  const rightSide = useAnimatedStyle(() => ({ opacity: dx.value > 0 ? 1 : 0 }));

  return (
    <View style={styles.wrap}>
      {/* Le degrade identitaire ne se montre qu'ici : sous le doigt, quand la
          ligne s'ecarte. Nulle part il ne recouvre une donnee. */}
      <Animated.View style={[styles.actions, reveal]}>
        <Wash />
        <Animated.Text style={[typo.chip, styles.label, rightSide, { color: theme.onBrand }]}>
          {right?.label ?? ''}
        </Animated.Text>
        <Animated.Text style={[typo.chip, styles.label, leftSide, { color: theme.onBrand }]}>
          {left?.label ?? ''}
        </Animated.Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={row}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: radius.sm },
  actions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  label: { fontSize: 11 },
});
