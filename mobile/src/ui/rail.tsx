import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme.ts';
import type { DurationTier } from '../../../src/types.ts';

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

/*
 * Une motrice a grande vitesse, reduite a ce qui la rend reconnaissable.
 *
 * Le nez pointe a droite et les barres de vitesse trainent a gauche : c'est le
 * sens de lecture, et la rame « entre » ainsi dans les donnees de sa ligne. Le
 * nez court sur un tiers de la longueur, la caisse est basse, le pantographe
 * est a l'arriere — trois traits qui suffisent a dire TGV plutot que « train ».
 *
 * Les barres portent le palier de duree, et elles seules : trois pour un
 * direct, une pour un arret de plus, aucune pour un omnibus — qui prend en plus
 * la couleur d'avertissement. C'est une substitution, pas un ajout : le glyphe
 * remplace la pastille de duree qui occupait la meme largeur en toutes lettres.
 */
const LOCO_RATIO = 66 / 22;

/** Caisse : toit plat, nez long et plongeant sur le tiers avant. */
const BODY =
  'M18 6 L44 6 C51 6.1 57 7.8 61.5 10.8 C64.2 12.6 65.7 14.8 66 17.2 L18 17.2 Z';
/** Pare-brise, couche sur la pente du nez. */
const SCREEN = 'M48 9.2 C52 9.7 55.4 11 58.2 12.9 L48 12.9 Z';

/** Barres de vitesse, de la plus longue a la plus courte. */
const SPEED_LINES = [
  'M2 9 H14',
  'M0 12.4 H11.5',
  'M4 15.6 H14',
] as const;

interface LocomotiveProps {
  tier: DurationTier;
  /** Train complet : la rame recule d'un plan avec le reste de la ligne. */
  dim?: boolean;
  height?: number;
  /** Couleur des vitres : celle du fond de la ligne, pour qu'elles percent. */
  glass: string;
}

export function Locomotive({ tier, dim = false, height = 14, glass }: LocomotiveProps) {
  const theme = useTheme();
  const body = tier === 'long' ? theme.amber : theme.steel;
  const lines = tier === 'direct' ? SPEED_LINES : tier === 'intermediaire' ? [SPEED_LINES[1]!] : [];

  return (
    <Svg
      width={height * LOCO_RATIO}
      height={height}
      viewBox="0 0 66 22"
      opacity={dim ? 0.4 : 1}
    >
      <G stroke={theme.steel} strokeWidth={1.7} strokeLinecap="round" opacity={0.7}>
        {lines.map((line) => (
          <Path key={line} d={line} />
        ))}
      </G>

      {/* Pantographe : le seul detail qui dit « electrique » d'un coup d'oeil. */}
      <G stroke={body} strokeWidth={1.3} strokeLinecap="round">
        <Path d="M30 6 L27 2.6" />
        <Path d="M30 6 L33.4 2.6" />
        <Path d="M26.4 2.6 H34" />
      </G>

      <Path d={BODY} fill={body} />
      <Rect x={21} y={8.6} width={24} height={3.6} rx={1.2} fill={glass} />
      <Path d={SCREEN} fill={glass} />
      <Rect x={18} y={14} width={40} height={1.5} fill={glass} opacity={0.45} />

      <G fill={theme.lineStrong}>
        <Circle cx={25} cy={18} r={2.4} />
        <Circle cx={54} cy={18} r={2.4} />
      </G>
    </Svg>
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
