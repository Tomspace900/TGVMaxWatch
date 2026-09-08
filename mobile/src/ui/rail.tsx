import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme.ts';

/*
 * Du materiel roulant, il ne reste que la voie.
 *
 * La motrice a ete essayee deux fois. En bandeau d'accueil elle repetait le
 * sens deja porte par le selecteur au-dessus ; en tete de chaque ligne de
 * train, elle encodait un palier de duree que l'horaire et la pastille `LONG`
 * disaient deja — trente-cinq glyphes pour une information deja lisible deux
 * fois sur la meme rangee. Une illustration doit porter quelque chose que le
 * texte ne porte pas ; celle-ci n'y est jamais arrivee.
 *
 * La voie, elle, ne dit rien et c'est son role : elle donne a la liste la forme
 * de ce qu'elle decrit, sans occuper la place d'une donnee. Avec le degrade
 * identitaire, c'est tout ce que ce fichier garde. `react-native-svg` est deja
 * embarque, ce qui evite un `expo-linear-gradient` et donc un nouvel APK pour
 * un fond.
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

/** Largeur de la voie a gauche d'une ligne, marge comprise. */
export const SPINE_WIDTH = 24;

/**
 * La voie qui court le long d'une liste de trains.
 *
 * Le separateur ferroviaire devient la structure de la journee plutot qu'un
 * ornement isole : chaque train est accroche a la voie par une traverse. Deux
 * files et un trait par rangee — l'effet ne coute presque rien, et il donne a
 * la liste la forme de ce qu'elle decrit.
 *
 * Dessinee en vues plutot qu'en SVG : deux filets verticaux et une barre se
 * rendent au pixel pres, et la voie doit couvrir la hauteur *avec* l'espace
 * entre deux cartes, sans quoi elle se coupe a chaque rangee.
 */
export function RailSpine() {
  const theme = useTheme();

  return (
    <View style={styles.spine} pointerEvents="none">
      <View style={[styles.rail, { left: 7, backgroundColor: theme.line }]} />
      <View style={[styles.rail, { left: 12, backgroundColor: theme.line }]} />
      <View style={[styles.tie, { backgroundColor: theme.line }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SPINE_WIDTH },
  rail: { position: 'absolute', top: 0, bottom: 0, width: 1.5 },
  // La traverse est posee a mi-hauteur de la rangee, espacement compris : trois
  // pixels de decalage avec le centre de la carte, invisibles a l'oeil.
  tie: { position: 'absolute', left: 3, top: '50%', width: 15, height: 1.5 },
});
