import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DIRECTIONS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { dateLabel, watchLabel } from '../../src/label.ts';
import { hasWatch, pruneWatch, setWatch, stamp } from '../../src/watchlist.ts';
import { useStore } from '../src/data/store.ts';
import { buildCalendar, horizonDates } from '../src/model.ts';
import { dirLabel, watchCutoff } from '../src/format.ts';
import { CalendarGrid } from '../src/ui/CalendarPager.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';
import type { Watch } from '../../src/types.ts';

/**
 * Suivre un creneau : un sens, un debut, une fin.
 *
 * Le besoin s'enonce « je rentre entre jeudi 18h et vendredi 11h » : une
 * fenetre qui peut passer la nuit, et rien d'autre. Les regles recurrentes et
 * les periodes nommees sont parties — une regle ratissait cinq jeudis pour en
 * designer un, et « le soir » commencait a 19h quand on voulait 18h.
 */

/** Les heures proposees, par demi-heure. Avant 5h il ne part aucun train. */
const TIMES = Array.from({ length: 38 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

export default function WatchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; dir?: string }>();
  const { width } = useWindowDimensions();
  const { bundle, setWatchlist } = useStore();

  const today = todayInParis();
  const dates = useMemo(() => horizonDates(today), [today]);
  const calendar = useMemo(() => buildCalendar(bundle.latest), [bundle.latest]);
  const start = params.date && dates.includes(params.date) ? params.date : today;

  const [dir, setDir] = useState(params.dir ?? DIRECTIONS[0]!);
  const [fromDate, setFromDate] = useState(start);
  const [fromTime, setFromTime] = useState('05:00');
  const [toDate, setToDate] = useState(start);
  const [toTime, setToTime] = useState('23:30');
  const [skipLong, setSkipLong] = useState(false);
  /*
   * Le toucher suivant etend-il la fenetre, ou la remplace-t-il ?
   *
   * Un jour venu de l'ecran d'une journee a ete choisi : toucher le lendemain
   * dit « jusqu'a demain ». Aujourd'hui, pose faute de mieux, n'est qu'une
   * supposition — le premier jour touche le remplace au lieu de s'y accrocher.
   */
  const [extending, setExtending] = useState(start === params.date);

  const pick = (date: string) => {
    if (extending && date > fromDate) {
      setToDate(date);
      setExtending(false);
    } else {
      setFromDate(date);
      setToDate(date);
      setExtending(true);
    }
  };

  const watch: Watch = {
    dir,
    from: stamp(fromDate, fromTime),
    to: stamp(toDate, toTime),
    ...(skipLong ? { skipLong: true as const } : {}),
  };
  const valid = watch.from <= watch.to;
  const already = hasWatch(bundle.watchlist, watch);

  const save = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWatchlist((current) => pruneWatch(setWatch(current, watch, true), watchCutoff()));
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
        <Text style={[typo.hero, { color: theme.text }]}>Suivre</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[typo.body, { color: theme.muted }]}>fermer</Text>
        </Pressable>
      </View>

      <Field label="Sens">
        <View style={styles.chips}>
          {DIRECTIONS.map((value) => (
            <Chip key={value} label={dirLabel(value)} active={value === dir} onPress={() => setDir(value)} />
          ))}
        </View>
      </Field>

      {/* Les jours se choisissent sur la grille de l'accueil, avec ses
          comptes : on pose un creneau la ou il reste quelque chose a
          attendre. La selection y porte l'anneau en pointilles qu'elle aura
          une fois suivie. */}
      <Field label="Jours">
        <CalendarGrid
          width={width - space.lg * 2}
          dates={dates}
          dir={dir}
          calendar={calendar}
          ring={(date) => (date >= fromDate && date <= toDate ? 'watched' : undefined)}
          onSelect={pick}
        />
        <Text style={[typo.small, { color: theme.muted, marginTop: space.sm }]}>
          un second jour prolonge la fenêtre jusqu'à lui
        </Text>
      </Field>

      <Hours label={`De · ${dateLabel(fromDate)}`} time={fromTime} onTime={setFromTime} />
      <Hours label={`À · ${dateLabel(toDate)}`} time={toTime} onTime={setToTime} />

      <Field label="Trajets de plus de 3 h">
        <View style={styles.chips}>
          <Chip label="comptés" active={!skipLong} onPress={() => setSkipLong(false)} />
          <Chip label="écartés" active={skipLong} onPress={() => setSkipLong(true)} />
        </View>
      </Field>

      <Pressable
        onPress={valid && !already ? save : undefined}
        style={({ pressed }) => [
          styles.save,
          {
            backgroundColor: theme.accent,
            borderRadius: radius.sm,
            opacity: !valid || already ? 0.4 : pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={[typo.section, { color: theme.onBrand }]}>
          {!valid ? 'La fin est avant le début' : already ? 'Déjà suivi' : `Suivre ${watchLabel(watch)}`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** Une heure qu'on touche, pour la borne dont le jour est nomme. */
function Hours({ label, time, onTime }: { label: string; time: string; onTime: (time: string) => void }) {
  return (
    <Field label={label}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.times}>
        {TIMES.map((value) => (
          <Chip
            key={value}
            label={value.endsWith(':00') ? `${Number(value.slice(0, 2))}h` : `${Number(value.slice(0, 2))}h30`}
            active={value === time}
            onPress={() => onTime(value)}
          />
        ))}
      </ScrollView>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.field, { borderTopColor: theme.line }]}>
      <Text style={[typo.chip, { color: theme.muted, marginBottom: space.sm }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  field: { paddingTop: space.lg, marginTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  times: { flexDirection: 'row', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9 },
  save: { marginTop: space.xl, paddingVertical: 15, alignItems: 'center' },
});
