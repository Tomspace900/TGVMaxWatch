import { useColorScheme } from 'react-native';

import ArchivoBold from '../assets/fonts/Archivo-Bold.ttf';
import ArchivoRegular from '../assets/fonts/Archivo-Regular.ttf';
import ArchivoSemiBold from '../assets/fonts/Archivo-SemiBold.ttf';
import ShareTechMonoRegular from '../assets/fonts/ShareTechMono-Regular.ttf';

/**
 * Deux familles de couleur, et elles ne se melangent jamais.
 *
 * `avail` est la seule echelle qui porte de l'information : plus il y a de
 * trains eligibles, plus la case est dense. `brand` est le degrade Carmillon
 * de SNCF Voyageurs — violet, framboise, vermillon — et il ne sert qu'a
 * l'habillage : navbar, materiel roulant, etats actifs, accents.
 *
 * La separation n'est pas cosmetique. Peindre le calendrier aux couleurs de la
 * marque et garder les memes teintes dans le chrome rend l'echelle illisible :
 * l'oeil ne sait plus si une case est rose parce qu'elle est pleine ou parce
 * que c'est la couleur du produit.
 *
 * Les valeurs Carmillon viennent de la palette publiee de SNCF Voyageurs. La
 * charte TGV INOUI elle-meme n'est pas publique : le « FrenchBerry » retenu ici
 * est le point median de ce degrade, pas une valeur officielle.
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
  /** Degrade Carmillon, du violet au vermillon. Habillage uniquement. */
  brand: readonly string[];
  /** L'accent plein, la ou un degrade n'a pas la place de se deployer. */
  accent: string;
  /** Encre lisible sur `accent` comme sur n'importe quelle borne du degrade. */
  onBrand: string;
  /** Fond de la navbar une fois qu'elle a decolle du haut de l'ecran. */
  navBg: string;
}

/**
 * Le degrade identitaire, du violet au vermillon.
 *
 * Il ne change pas entre le mode clair et le mode sombre : une marque garde
 * ses couleurs, c'est le fond qui bouge autour.
 */
const CARMILLON = ['#7d206f', '#b01678', '#c21758', '#da1d33', '#eb1925'] as const;

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
  // En mode clair, plus il y a de trains, plus la case est dense.
  avail: ['#ebebe8', '#d3ece0', '#93d3b6', '#3ca176', '#0a6b4b'],
  availInk: ['#8b9196', '#16412f', '#0a3324', '#ffffff', '#e8f8f0'],
  brand: CARMILLON,
  accent: '#c21758',
  onBrand: '#ffffff',
  navBg: 'rgba(251,251,249,0.94)',
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
  brand: CARMILLON,
  accent: '#c21758',
  onBrand: '#ffffff',
  navBg: 'rgba(14,16,18,0.92)',
};

/**
 * Le materiel roulant garde ses vraies couleurs.
 *
 * Une rame est grise et blanche, quel que soit le theme du telephone. Lui
 * appliquer la palette de l'interface la ferait disparaitre sur fond clair et
 * la transformerait en tache sombre sur fond sombre : elle ne se lirait plus
 * comme un train.
 */
export const rolling = {
  body: '#e9e9e6',
  bodyShade: '#cfcfca',
  glass: '#1b1e22',
  gear: '#33383e',
} as const;

/**
 * Deux polices, et une frontiere nette entre les deux.
 *
 * Archivo pour la langue : c'est un grotesque de signaletique, dessine pour
 * etre lu vite et de loin, et il tient les diacritiques francais. Share Tech
 * Mono pour tout ce qui se lit comme un afficheur de quai — horaires, durees,
 * compteurs — parce que ses chiffres ont tous la meme largeur et qu'une colonne
 * de nombres qui ne s'aligne pas se lit comme un defaut d'affichage.
 *
 * Achemine, la police de la SNCF, est propriétaire et ne peut pas etre
 * embarquee ici. Les deux retenues sont sous licence SIL Open Font.
 */
export const font = {
  regular: 'Archivo',
  semi: 'Archivo-SemiBold',
  bold: 'Archivo-Bold',
  mono: 'ShareTechMono',
} as const;

/**
 * Ce que `useFonts` charge au demarrage.
 *
 * Sur Android, `fontWeight` ne synthetise rien face a une famille embarquee :
 * demander du gras a « Archivo » rend du romain. Chaque graisse est donc une
 * famille nommee, et les styles ci-dessous les designent explicitement plutot
 * que de passer par `fontWeight`.
 */
export const fontAssets = {
  [font.regular]: ArchivoRegular,
  [font.semi]: ArchivoSemiBold,
  [font.bold]: ArchivoBold,
  [font.mono]: ShareTechMonoRegular,
};

export const typo = {
  hero: { fontFamily: font.bold, fontSize: 27, letterSpacing: -0.5 },
  title: { fontFamily: font.bold, fontSize: 19, letterSpacing: -0.3 },
  section: { fontFamily: font.semi, fontSize: 15 },
  body: { fontFamily: font.regular, fontSize: 13.5 },
  small: { fontFamily: font.regular, fontSize: 12 },
  strong: { fontFamily: font.semi, fontSize: 12.5 },
  chip: { fontFamily: font.semi, fontSize: 10, letterSpacing: 0.4 },
  /** Afficheur de quai : horaires, durees, numeros. */
  clock: { fontFamily: font.mono, fontSize: 19, letterSpacing: 0.8 },
  digits: { fontFamily: font.mono, fontSize: 12.5, letterSpacing: 0.4 },
  counter: { fontFamily: font.mono, fontSize: 32, letterSpacing: 0.5 },
} as const;

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
