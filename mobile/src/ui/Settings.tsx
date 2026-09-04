import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typo, useTheme } from '../theme.ts';

/**
 * Briques de l'ecran de reglages.
 *
 * Elles existent pour qu'une section ne soit pas dessinee a la main a chaque
 * fois : sept sections construites chacune a sa facon donnaient sept alignements
 * differents, ce qui se lit exactement comme le desordre que c'est.
 *
 * La seule couleur admise ici est l'accent de la marque, et uniquement pour
 * « quelque chose ne va pas » ou « c'est l'action principale ». L'echelle de
 * disponibilite, elle, ne sort jamais du calendrier : un creneau de quota peint
 * en vert se lirait comme une mesure de disponibilite alors qu'il n'en est pas
 * une.
 */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderBottomColor: theme.line }]}>
      <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** Paragraphe explicatif. Toujours en retrait, jamais en gras. */
export function Note({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.muted }]}>{children}</Text>;
}

/**
 * Ligne cle / valeur.
 *
 * La valeur est en chiffres tabulaires : une colonne de valeurs qui ne
 * s'alignent pas verticalement trahit l'amateurisme, et c'est la moitie de ce
 * qui donnait a cet ecran son air bricole.
 */
export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.text }, mono && styles.rowMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Etat d'un reglage, en une ligne.
 *
 * `attention` prend l'accent de la marque, exactement comme le bandeau de
 * fraicheur du calendrier : c'est le seul registre visuel du projet pour
 * « quelque chose ne va pas ».
 */
export function Status({ text, attention }: { text: string; attention?: boolean }) {
  const theme = useTheme();
  if (!attention) {
    return <Text style={[styles.status, { color: theme.text }]}>{text}</Text>;
  }
  return (
    <View style={[styles.alert, { backgroundColor: theme.accent, borderRadius: radius.sm }]}>
      <Text style={[styles.alertText, { color: theme.onBrand }]}>{text}</Text>
    </View>
  );
}

export function Action({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : theme.sunken,
          borderRadius: radius.sm,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[styles.buttonText, { color: primary ? theme.onBrand : theme.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Deux actions cote a cote, pour une decision et son annulation. */
export function Actions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  sectionTitle: { ...typo.chip, fontSize: 11, letterSpacing: 0.9, marginBottom: space.xs },
  note: { ...typo.small, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  rowLabel: { ...typo.small },
  // La valeur est en Share Tech Mono : une colonne de valeurs qui ne s'alignent
  // pas verticalement se lit comme un defaut d'affichage.
  rowValue: { ...typo.digits, flexShrink: 1 },
  rowMono: { ...typo.digits },
  status: { ...typo.section, fontSize: 13.5 },
  alert: { padding: space.md },
  alertText: { ...typo.strong, lineHeight: 18 },
  button: { paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { ...typo.section, fontSize: 14 },
  actions: { flexDirection: 'row', gap: space.sm },
});
