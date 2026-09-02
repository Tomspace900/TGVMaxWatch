import { useColorScheme } from 'react-native';

/**
 * Une seule couleur saturee porte l'information : l'echelle de disponibilite.
 * Tout le reste est neutre. La profondeur, les arrondis et le mouvement rendent
 * l'objet agreable a manipuler, ils n'encodent jamais une valeur.
 */
export interface Palette {
  bg: string;
  surface: string;
  raised: string;
  sunken: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  inverseBg: string;
  inverseText: string;
  /** Cinq paliers : 0 / 1-2 / 3-5 / 6-11 / 12+ trains eligibles. */
  avail: readonly string[];
  availInk: readonly string[];
}

const light: Palette = {
  bg: '#f4f4f2',
  surface: '#fbfbf9',
  raised: '#ffffff',
  sunken: '#eeeeec',
  line: '#e2e2de',
  lineStrong: '#b9b9b2',
  text: '#16181a',
  muted: '#6b7075',
  inverseBg: '#16181a',
  inverseText: '#f7f7f5',
  // En mode clair, plus il y a de places, plus la case est dense.
  avail: ['#ebebe8', '#d3ece0', '#93d3b6', '#3ca176', '#0a6b4b'],
  availInk: ['#8b9196', '#16412f', '#0a3324', '#ffffff', '#e8f8f0'],
};

const dark: Palette = {
  bg: '#0e1012',
  // Les surfaces s'eclaircissent avec l'elevation : c'est ce qui donne la
  // profondeur en mode sombre, ou une ombre ne se voit pas.
  surface: '#17191c',
  raised: '#1e2125',
  sunken: '#121417',
  line: '#282c31',
  lineStrong: '#4a5157',
  text: '#eceef0',
  muted: '#949ca3',
  inverseBg: '#eceef0',
  inverseText: '#0e1012',
  // En mode sombre la progression va vers la luminosite, pas vers la densite.
  avail: ['#1c2024', '#10402f', '#176b4e', '#24aa7d', '#47e5aa'],
  availInk: ['#6b747b', '#82c9a9', '#d6f2e5', '#05221a', '#05221a'],
};

export const radius = { sm: 10, md: 14, lg: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 6, md: 10, lg: 16, xl: 22 } as const;

/**
 * Duree des transitions. Court pour les changements d'etat, ressort reserve a
 * ce qui suit le doigt.
 */
export const motion = {
  fast: 140,
  normal: 220,
  spring: { damping: 20, stiffness: 220, mass: 0.7 },
  /** Ressort plus vif pour ce qui se relache sous le doigt. */
  snap: { damping: 24, stiffness: 340, mass: 0.6 },
} as const;

export function useTheme(): Palette & { dark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { ...(isDark ? dark : light), dark: isDark };
}

export { light as lightPalette, dark as darkPalette };
