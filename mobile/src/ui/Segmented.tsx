import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Wash } from './rail.tsx';
import { motion, radius, typo, useTheme } from '../theme.ts';

interface Props {
  labels: string[];
  index: number;
  /**
   * Position continue pilotee par le carrousel, en fraction d'onglet.
   * C'est ce suivi 1:1 — et non la transition de fin — qui fait « natif ».
   */
  progress: SharedValue<number>;
  onChange: (index: number) => void;
}

export function Segmented({ labels, index, progress, onChange }: Props) {
  const theme = useTheme();
  const width = useSharedValue(0);

  useEffect(() => {
    // Un changement par tap n'a pas de geste pour porter la position.
    progress.value = withSpring(index, motion.spring);
  }, [index, progress]);

  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (width.value / labels.length) }],
  }));

  return (
    <View
      style={[styles.track, { backgroundColor: theme.sunken, borderRadius: radius.pill }]}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width - 6;
      }}
    >
      {/* Le curseur porte le degrade Carmillon : c'est le seul element
          permanent de l'ecran ou la marque a de la place pour se deployer. */}
      <Animated.View
        style={[
          styles.thumb,
          thumb,
          // L'accent plein sert de fond de secours : si le degrade ne se
          // peint pas, le curseur reste visible plutot que de disparaitre.
          {
            width: `${100 / labels.length}%`,
            borderRadius: radius.pill,
            backgroundColor: theme.accent,
            shadowColor: '#000',
          },
        ]}
      >
        <Wash diagonal={false} />
      </Animated.View>

      {labels.map((label, i) => (
        <Pressable key={label} style={styles.option} onPress={() => onChange(i)}>
          <Text
            numberOfLines={1}
            style={[
              i === index ? typo.section : typo.body,
              { color: i === index ? theme.onBrand : theme.muted },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 40,
    padding: 3,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    overflow: 'hidden',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
