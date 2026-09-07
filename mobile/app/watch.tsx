import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DIRECTIONS } from '../../src/config.ts';
import { pruneWatch } from '../../src/watchlist.ts';
import { useStore } from '../src/data/store.ts';
import { dirLabel, watchCutoff, weekdayName } from '../src/format.ts';
import { radius, space, typo, useTheme } from '../src/theme.ts';
import type { Weekday, WatchRule } from '../../src/types.ts';

/**
 * Creer une surveillance recurrente.
 *
 * Le format `{jour de semaine, sens, fenetre horaire}` et le moteur qui le lit
 * existaient depuis le debut ; il n'y avait simplement aucun ecran pour en
 * poser une, et elles ne pouvaient s'ecrire qu'a la main dans le depot. C'est
 * pourtant la forme la plus utile du suivi : « les lundis matin dans ce sens »
 * ne se redemande pas chaque semaine.
 */

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Creneaux nommes plutot qu'un selecteur d'heure.
 *
 * Personne ne pense « apres 16h07 » : on pense « le vendredi soir ». Quatre
 * choix couvrent la facon dont un deplacement se decide, et les bornes restent
 * affichees pour que le raccourci ne cache jamais ce qu'il fait.
 */
const SLOTS = [
  { key: 'matin', label: 'matin', after: '05:00', before: '11:59' },
  { key: 'midi', label: 'midi', after: '12:00', before: '15:59' },
  { key: 'soir', label: 'soir', after: '16:00', before: '22:59' },
  { key: 'jour', label: 'toute la journée', after: undefined, before: undefined },
] as const;

export default function WatchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, setWatchlist } = useStore();

  const [weekday, setWeekday] = useState<Weekday>('fri');
  const [dirIndex, setDirIndex] = useState<number>(0);
  const [slotIndex, setSlotIndex] = useState(0);

  const slot = SLOTS[slotIndex]!;
  // Le troisieme choix est « les deux sens », que le format exprime par
  // l'absence de sens.
  const dir = DIRECTIONS[dirIndex];

  const rule: WatchRule = {
    weekday,
    ...(dir ? { dir } : {}),
    ...(slot.after ? { after: slot.after } : {}),
    ...(slot.before ? { before: slot.before } : {}),
  };

  const already = bundle.watchlist.rules.some(
    (entry) =>
      entry.weekday === rule.weekday &&
      entry.dir === rule.dir &&
      entry.after === rule.after &&
      entry.before === rule.before,
  );

  const save = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWatchlist(
      (current) => pruneWatch({ ...current, rules: [...current.rules, rule] }, watchCutoff()),
      `watchlist: regle ${weekday}${slot.after ? ` ${slot.after}` : ''}`,
    );
    router.back();
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
    >
      <View style={styles.head}>
        <Text style={[typo.hero, { color: theme.text }]}>Surveiller</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[typo.body, { color: theme.muted }]}>fermer</Text>
        </Pressable>
      </View>

      <Text style={[typo.small, styles.intro, { color: theme.muted }]}>
        Une alerte partira chaque fois qu'un train de ce créneau s'ouvre ou se ferme, semaine après
        semaine. Rien à refaire.
      </Text>

      <Field label="Jour">
        <View style={styles.chips}>
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              label={weekdayName(day).slice(0, 3)}
              active={day === weekday}
              onPress={() => setWeekday(day)}
            />
          ))}
        </View>
      </Field>

      <Field label="Sens">
        <View style={styles.chips}>
          {DIRECTIONS.map((value, index) => (
            <Chip
              key={value}
              label={dirLabel(value)}
              active={index === dirIndex}
              onPress={() => setDirIndex(index)}
            />
          ))}
          <Chip
            label="les deux sens"
            active={dirIndex === DIRECTIONS.length}
            onPress={() => setDirIndex(DIRECTIONS.length)}
          />
        </View>
      </Field>

      <Field label="Créneau">
        <View style={styles.chips}>
          {SLOTS.map((entry, index) => (
            <Chip
              key={entry.key}
              label={entry.label}
              active={index === slotIndex}
              onPress={() => setSlotIndex(index)}
            />
          ))}
        </View>
        {/* Le raccourci ne doit jamais cacher ce qu'il fait. */}
        <Text style={[typo.digits, { color: theme.muted, marginTop: space.sm }]}>
          {slot.after ? `${slot.after} – ${slot.before}` : 'tous les départs'}
        </Text>
      </Field>

      <Pressable
        onPress={already ? undefined : save}
        style={({ pressed }) => [
          styles.save,
          {
            backgroundColor: theme.accent,
            borderRadius: radius.sm,
            opacity: already ? 0.4 : pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={[typo.section, { color: theme.onBrand }]}>
          {already ? 'Cette surveillance existe déjà' : `Surveiller les ${weekdayName(weekday)}s`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.field, { borderTopColor: theme.line }]}>
      <Text style={[typo.chip, { color: theme.muted, marginBottom: space.sm }]}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.inverseBg : theme.sunken,
          borderRadius: radius.pill,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typo.strong, { color: active ? theme.inverseText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  intro: { lineHeight: 18, marginTop: space.sm },
  field: {
    paddingTop: space.lg,
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9 },
  save: { marginTop: space.xl, paddingVertical: 15, alignItems: 'center' },
});
