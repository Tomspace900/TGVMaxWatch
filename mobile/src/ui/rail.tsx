import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { rolling, useTheme } from '../theme.ts';

/**
 * Le materiel roulant, dessine plutot qu'illustre.
 *
 * Ces silhouettes ne sont pas la pour decorer : la rame de `QuotaCard` compte
 * six voitures parce que l'abonnement autorise six reservations simultanees, et
 * une voiture attelee se lit plus vite qu'une barre de progression. La
 * locomotive, elle, ne parait qu'une fois par ecran — a la place d'un titre.
 *
 * Tout est vectoriel et local : `react-native-svg` est deja embarque, ce qui
 * evite un `expo-linear-gradient` et donc un nouvel APK pour un degrade.
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

const LOCO_RATIO = 168 / 52;
const CAR_RATIO = 118 / 52;

/** Contour de caisse : nez plongeant a gauche, attelage droit a droite. */
const LOCO_BODY =
  'M4 41 C4 27 15 17 44 13.5 L152 13.5 C158.5 13.5 162 17 162 23 L162 41 Z';
/** Bandeau de nez, la ou une rame INOUI porte sa couleur. */
const LOCO_NOSE = 'M4 41 C4 27 15 17 44 13.5 L44 20.5 C21 24.5 12 31.5 12 41 Z';
/** Pare-brise de cabine, incline comme la caisse. */
const LOCO_SCREEN = 'M20 28.5 C22.5 22 29 18.5 45 17 L45 28.5 Z';

/**
 * Motrice a grande vitesse, de profil.
 *
 * Les couleurs de caisse ne suivent pas le theme : une rame est grise et
 * blanche sur un quai, et la repeindre en sombre sur fond sombre la ferait
 * cesser de se lire comme un train.
 */
export function Locomotive({ height = 40 }: { height?: number }) {
  const theme = useTheme();
  const id = useGradientId('loco');
  const width = height * LOCO_RATIO;

  return (
    <Svg width={width} height={height} viewBox="0 0 168 52">
      <Defs>
        <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          {theme.brand.map((color, index) => (
            <Stop
              key={color}
              offset={`${index / (theme.brand.length - 1)}`}
              stopColor={color}
            />
          ))}
        </LinearGradient>
      </Defs>

      {/* Pantographe : le seul detail qui dit « electrique » d'un coup d'oeil. */}
      <G stroke={rolling.gear} strokeWidth={1.6} strokeLinecap="round">
        <Line x1={96} y1={13.5} x2={90} y2={4.5} />
        <Line x1={96} y1={13.5} x2={104} y2={4.5} />
        <Line x1={87} y1={4.5} x2={107} y2={4.5} />
      </G>

      {/* Bogies, sous la caisse pour qu'elle les recouvre a moitie. */}
      <G fill={rolling.gear}>
        <Circle cx={46} cy={42} r={5.5} />
        <Circle cx={140} cy={42} r={5.5} />
      </G>

      <Path d={LOCO_BODY} fill={rolling.body} stroke={theme.lineStrong} strokeWidth={0.6} />
      <Rect x={12} y={36} width={150} height={5} fill={rolling.bodyShade} />
      <Path d={LOCO_NOSE} fill={`url(#${id})`} />
      <Rect x={118} y={13.5} width={7} height={27.5} fill={`url(#${id})`} />
      <Path d={LOCO_SCREEN} fill={rolling.glass} />
      <Rect x={55} y={18} width={57} height={10} rx={2.5} fill={rolling.glass} />
      <Rect x={131} y={18} width={22} height={10} rx={2.5} fill={rolling.glass} />
    </Svg>
  );
}

/**
 * Une voiture, pleine ou vide.
 *
 * `filled` distingue un creneau occupe d'un creneau libre : une voiture vide
 * garde son contour et perd sa caisse, ce qui se compte aussi vite qu'une
 * rangee de pastilles mais dit de quoi il s'agit.
 */
export function Wagon({ height = 40, filled = true }: { height?: number; filled?: boolean }) {
  const theme = useTheme();
  const id = useGradientId('car');
  const width = height * CAR_RATIO;

  if (!filled) {
    return (
      <Svg width={width} height={height} viewBox="0 0 118 52">
        <Rect
          x={3}
          y={13.5}
          width={112}
          height={27.5}
          rx={4}
          fill="none"
          stroke={theme.lineStrong}
          strokeWidth={1.6}
          strokeDasharray="5 4"
        />
      </Svg>
    );
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 118 52">
      <Defs>
        <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          {theme.brand.map((color, index) => (
            <Stop
              key={color}
              offset={`${index / (theme.brand.length - 1)}`}
              stopColor={color}
            />
          ))}
        </LinearGradient>
      </Defs>

      <G fill={rolling.gear}>
        <Circle cx={28} cy={42} r={5.5} />
        <Circle cx={90} cy={42} r={5.5} />
      </G>

      <Rect
        x={3}
        y={13.5}
        width={112}
        height={27.5}
        rx={4}
        fill={rolling.body}
        stroke={theme.lineStrong}
        strokeWidth={0.6}
      />
      <Rect x={3} y={36} width={112} height={5} fill={rolling.bodyShade} />
      <Rect x={12} y={18} width={16} height={10} rx={2.5} fill={rolling.glass} />
      <Rect x={44} y={18} width={30} height={10} rx={2.5} fill={rolling.glass} />
      <Rect x={90} y={18} width={16} height={10} rx={2.5} fill={rolling.glass} />
      {/* Les portes portent la couleur, comme sur une rame reelle. */}
      <Rect x={34} y={13.5} width={6} height={27.5} fill={`url(#${id})`} />
      <Rect x={78} y={13.5} width={6} height={27.5} fill={`url(#${id})`} />
    </Svg>
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
