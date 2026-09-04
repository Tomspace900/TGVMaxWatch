import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '../theme.ts';

/**
 * Briques de l'ecran de reglages.
 *
 * Elles existent pour qu'une section ne soit pas dessinee a la main a chaque
 * fois : sept sections construites chacune a sa facon donnaient sept alignements
 * differents, ce qui se lit exactement comme le desordre que c'est.
 *
 * Aucune couleur saturee ici. Dans ce projet la couleur n'encode qu'une chose,
 * l'echelle de disponibilite ; un etat de reglage se dit par le contraste et le
 * poids typographique.
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
 * `attention` inverse le fond, exactement comme le bandeau de fraicheur du
 * calendrier : c'est le seul registre visuel du projet pour « quelque chose ne
 * va pas », et il ne coute pas une couleur de plus.
 */
export function Status({ text, attention }: { text: string; attention?: boolean }) {
  const theme = useTheme();
  if (!attention) {
    return <Text style={[styles.status, { color: theme.text }]}>{text}</Text>;
  }
  return (
    <View style={[styles.alert, { backgroundColor: theme.inverseBg, borderRadius: radius.sm }]}>
      <Text style={[styles.alertText, { color: theme.inverseText }]}>{text}</Text>
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
          backgroundColor: primary ? theme.inverseBg : theme.sunken,
          borderRadius: radius.sm,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[styles.buttonText, { color: primary ? theme.inverseText : theme.text }]}
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
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: space.xs },
  note: { fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  rowLabel: { fontSize: 12.5 },
  rowValue: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 1 },
  rowMono: { fontFamily: 'monospace', fontWeight: '400' },
  status: { fontSize: 13.5, fontWeight: '600' },
  alert: { padding: space.md },
  alertText: { fontSize: 12.5, fontWeight: '500', lineHeight: 18 },
  button: { paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.sm },
});
