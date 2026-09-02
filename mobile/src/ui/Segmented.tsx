import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { motion, radius, useTheme } from '../theme.ts';

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
      <Animated.View
        style={[
          styles.thumb,
          thumb,
          {
            width: `${100 / labels.length}%`,
            backgroundColor: theme.raised,
            borderRadius: radius.pill,
            shadowColor: '#000',
          },
        ]}
      />

      {labels.map((label, i) => (
        <Pressable key={label} style={styles.option} onPress={() => onChange(i)}>
          <Text
            numberOfLines={1}
            style={[styles.label, { color: i === index ? theme.text : theme.muted }]}
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
    height: 42,
    padding: 3,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
