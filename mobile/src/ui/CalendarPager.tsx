import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { weekday } from '../../../src/dates.ts';
import { availabilityBucket, emptyDay, horizonDates, type Calendar } from '../model.ts';
import { dayNumber } from '../format.ts';
import { motion, radius, space, typo, useTheme } from '../theme.ts';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
/** Largeur de bord captee par le geste de retour d'Android. */
const EDGE_GUARD = 24;

interface Props {
  calendar: Calendar;
  today: string;
  directions: readonly string[];
  index: number;
  /** Position continue partagee avec le selecteur, en fraction de panneau. */
  progress: SharedValue<number>;
  onIndexChange: (index: number) => void;
  onSelect: (date: string, dir: string) => void;
}

export function CalendarPager({
  calendar,
  today,
  directions,
  index,
  progress,
  onIndexChange,
  onSelect,
}: Props) {
  const { width } = useWindowDimensions();
  const dates = useMemo(() => horizonDates(today), [today]);

  const commit = (next: number) => {
    if (next === index) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIndexChange(next);
  };

  /*
   * Le geste vit sur le thread d'interface : c'est toute la difference avec la
   * version web, ou chaque frame devait traverser le pont. `activeOffsetX`
   * laisse passer les gestes verticaux, et la garde de bord evite d'entrer en
   * conflit avec le retour systeme d'Android.
   */
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin((event) => {
      if (event.x < EDGE_GUARD || event.x > width - EDGE_GUARD) {
        // Rien : la garde est appliquee dans onUpdate via le meme test.
      }
    })
    .onUpdate((event) => {
      if (event.absoluteX - event.translationX < EDGE_GUARD) return;
      const wanted = index - event.translationX / width;
      // Resistance aux extremites : il n'y a que deux sens.
      const clamped = Math.min(directions.length - 1, Math.max(0, wanted));
      progress.value = clamped + (wanted - clamped) * 0.25;
    })
    .onEnd((event) => {
      // La vitesse decide, pas la position : un geste vif doit atteindre le
      // panneau suivant meme relache a mi-chemin.
      const projected = progress.value - (event.velocityX / width) * 0.25;
      const next = Math.min(directions.length - 1, Math.max(0, Math.round(projected)));
      progress.value = withSpring(next, motion.snap);
      runOnJS(commit)(next);
    });

  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * width }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.viewport}>
        <Animated.View style={[styles.track, { width: width * directions.length }, track]}>
          {directions.map((dir) => (
            <Grid
              key={dir}
              width={width}
              dates={dates}
              today={today}
              dir={dir}
              calendar={calendar}
              onSelect={onSelect}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

interface GridProps {
  width: number;
  dates: string[];
  today: string;
  dir: string;
  calendar: Calendar;
  onSelect: (date: string, dir: string) => void;
}

function Grid({ width, dates, today, dir, calendar, onSelect }: GridProps) {
  const theme = useTheme();
  // Aligne la grille sur les jours de la semaine : « les vendredis soir » est
  // le raisonnement reel devant cette donnee, il doit se lire en colonne.
  const lead = (weekday(dates[0]!) + 6) % 7;
  const cell = (width - space.lg * 2 - space.sm * 6) / 7;

  return (
    <View style={[styles.panel, { width, paddingHorizontal: space.lg }]}>
      <View style={styles.weekdays}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={[styles.weekday, { width: cell, color: theme.muted }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: lead }, (_, i) => (
          <View key={`blank-${i}`} style={{ width: cell, height: cell / 0.74 }} />
        ))}

        {dates.map((date) => {
          const day = calendar.get(date)?.get(dir) ?? emptyDay(date, dir);
          const bucket = availabilityBucket(day.available);

          return (
            <Pressable
              key={date}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(date, dir);
              }}
              style={({ pressed }) => [
                styles.cell,
                {
                  width: cell,
                  height: cell / 0.74,
                  backgroundColor: theme.avail[bucket],
                  borderRadius: radius.sm,
                  transform: [{ scale: pressed ? 0.93 : 1 }],
                },
              ]}
              accessibilityLabel={`${date}, ${day.available} trains ouverts`}
            >
              {/* Toutes les places du jour sont sur des trains de plus de 3h :
                  sans ce marqueur, la couleur mentirait. */}
              {day.onlyLong && (
                <View
                  style={[
                    styles.corner,
                    { borderTopColor: theme.availInk[bucket], borderTopWidth: cell * 0.26 },
                  ]}
                />
              )}

              <Text style={[styles.dayNumber, { color: theme.availInk[bucket] }]}>
                {dayNumber(date)}
                {date === today ? ' ·' : ''}
              </Text>
              <Text style={[styles.count, { color: theme.availInk[bucket] }]}>
                {day.available}
              </Text>

              {day.delta !== null && day.delta !== 0 && (
                <Text style={[styles.delta, { color: theme.availInk[bucket] }]}>
                  {day.delta > 0 ? `+${day.delta}` : day.delta}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
  panel: {},
  weekdays: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  weekday: { ...typo.chip, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  corner: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRightWidth: 11,
    borderRightColor: 'transparent',
    opacity: 0.5,
  },
  dayNumber: { ...typo.small, fontSize: 10.5, opacity: 0.72, lineHeight: 13 },
  // Le compte se lit comme un afficheur : chiffres de largeur egale, une
  // colonne de cases qui ne s'alignent pas se lit comme un defaut.
  count: { ...typo.clock, fontSize: 21, lineHeight: 25, letterSpacing: 0 },
  delta: { ...typo.digits, position: 'absolute', right: 4, bottom: 3, fontSize: 9.5, opacity: 0.8 },
});
