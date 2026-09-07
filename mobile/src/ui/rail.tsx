import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme.ts';

/*
 * La motrice et les voitures ont ete retirees.
 *
 * La motrice habillait un bandeau qui repetait le sens deja porte par le
 * selecteur juste au-dessus, et poussait sous la ligne de flottaison la carte
 * qui porte le coeur du produit. Les voitures comptaient un quota de six
 * reservations dont personne n'a besoin. Une illustration qui coute la
 * premiere moitie d'un ecran de telephone doit porter une information ; ni
 * l'une ni l'autre n'en portait.
 *
 * Reste ce qui sert : le degrade identitaire, et un filet de separation.
 * `react-native-svg` est deja embarque, ce qui evite un `expo-linear-gradient`
 * et donc un nouvel APK pour un fond.
 */

/**
 * Un identifiant de degrade qui ne collisionne pas.
 *
 * Les `id` d'un `<Defs>` sont resolus globalement : deux composants montes en
 * meme temps avec le meme identifiant font que le second ecrase le premier, et
 * un degrade disparait sans erreur. `useId` produit des jetons contenant des
 * deux-points, que `url(#...)` ne sait pas lire — d'ou le filtrage.
 */
function useGradientId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

interface WashProps {
  /** Bornes du degrade Carmillon a retenir, du plus fonce au plus clair. */
  stops?: readonly string[];
  /** Diagonale par defaut ; `false` pour un balayage horizontal pur. */
  diagonal?: boolean;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Le degrade identitaire, en fond d'un conteneur.
 *
 * Se pose en `absoluteFill` derriere le contenu : c'est l'equivalent d'un
 * `background-image: linear-gradient(...)` du web.
 */
export function Wash({ stops, diagonal = true, opacity = 1, style }: WashProps) {
  const theme = useTheme();
  const id = useGradientId('wash');
  const palette = stops ?? theme.brand;

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2={diagonal ? '1' : '0'}>
            {palette.map((color, index) => (
              <Stop
                key={color}
                offset={palette.length === 1 ? '0' : `${index / (palette.length - 1)}`}
                stopColor={color}
                stopOpacity={opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Une voie, en guise de separateur.
 *
 * Deux files et des traverses : c'est le seul filet horizontal de
 * l'application, et il remplace une bordure sans couter plus de pixels.
 */
export function RailTrack({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();

  return (
    <View style={[{ height: 7 }, style]} pointerEvents="none">
      <Svg width="100%" height={7}>
        <Line
          x1="0"
          y1={5.5}
          x2="100%"
          y2={5.5}
          stroke={theme.line}
          strokeWidth={3}
          strokeDasharray="2 7"
        />
        <Line x1="0" y1={1} x2="100%" y2={1} stroke={theme.line} strokeWidth={1.2} />
        <Line x1="0" y1={4} x2="100%" y2={4} stroke={theme.line} strokeWidth={1.2} />
      </Svg>
    </View>
  );
}
