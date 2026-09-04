import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../theme.ts';

/** Hauteur de la barre, hors encoche. Les ecrans en ont besoin pour leur marge. */
export const BAR_HEIGHT = 54;

interface Props {
  /** Position de defilement, ecrite par le `ScrollView` de l'ecran. */
  scrollY: SharedValue<number>;
  children: ReactNode;
}

/**
 * La barre qui reste.
 *
 * Ce qui repond a « quel sens ? » et « quel jour ? » ne doit pas partir avec le
 * defilement : c'est le contexte de tout ce qu'on lit en dessous, et le
 * retrouver demandait de remonter.
 *
 * Le fond est opaque des le depart — une barre translucide sur un degrade rend
 * le selecteur illisible — et seul le filet du bas apparait au decollage. C'est
 * la convention Android : rien ne bouge, une ombre dit simplement qu'il y a du
 * contenu au-dessus.
 */
export function StickyBar({ scrollY, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const edge = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 24], [0, 1], 'clamp'),
  }));

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top, height: insets.top + BAR_HEIGHT, backgroundColor: theme.bg },
      ]}
    >
      {children}
      <Animated.View
        style={[
          styles.edge,
          edge,
          { backgroundColor: theme.line, height: StyleSheet.hairlineWidth * 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, justifyContent: 'center' },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
