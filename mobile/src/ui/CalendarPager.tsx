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
  /**
   * Les marques des jours, par `date|sens`.
   *
   * Un sens et pas seulement une date : marquer le 12 dans les deux panneaux
   * ferait croire a un retour reserve qui n'existe pas.
   */
  marks: Map<string, Ring>;
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
  marks,
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
            <View key={dir} style={{ width, paddingHorizontal: space.lg }}>
              <CalendarGrid
                width={width - space.lg * 2}
                dates={dates}
                dir={dir}
                calendar={calendar}
                ring={(date) => marks.get(`${date}|${dir}`)}
                onSelect={(date) => onSelect(date, dir)}
              />
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * Un train reserve ce jour-la, ou un creneau suivi qui le touche.
 *
 * Le meme anneau, plein ou en pointilles : les deux sont des marques que tu as
 * posees, et c'est la forme qui les distingue, pas la couleur — la regle qui
 * rend sure chaque couleur porteuse de sens ici.
 */
export type Ring = 'booked' | 'watched';

interface GridProps {
  /** Largeur utile, gouttieres deja retirees. */
  width: number;
  dates: string[];
  dir: string;
  calendar: Calendar;
  ring: (date: string) => Ring | undefined;
  onSelect: (date: string) => void;
}

/** La grille seule : l'accueil la pagine par sens, l'editeur de creneau y choisit ses jours. */
export function CalendarGrid({ width, dates, dir, calendar, ring, onSelect }: GridProps) {
  const theme = useTheme();
  // Aligne la grille sur les jours de la semaine : « les vendredis soir » est
  // le raisonnement reel devant cette donnee, il doit se lire en colonne.
  const lead = (weekday(dates[0]!) + 6) % 7;
  const cell = (width - space.sm * 6) / 7;

  return (
    <View>
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
          const [morning, afternoon] = day.halves;
          const mark = ring(date);

          return (
            <Pressable
              key={date}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(date);
              }}
              /*
               * Un anneau Carmillon, et non une teinte.
               *
               * La couleur de la case appartient a l'echelle de disponibilite
               * et ne se partage pas : la repeindre pour dire autre chose la
               * rendrait illisible. L'anneau est une marque posee autour, dans
               * la famille qui designe ce qui t'engage — une reservation en
               * est.
               *
               * La bordure est sur *toutes* les cases, transparente quand il
               * n'y a rien : sinon les deux ou trois cases marquees auraient
               * une boite interieure plus petite, et leurs chiffres sauteraient
               * de deux pixels au milieu de la grille.
               */
              style={({ pressed }) => [
                styles.cell,
                {
                  width: cell,
                  height: cell / 0.74,
                  borderColor: mark ? theme.accent : 'transparent',
                  borderStyle: mark === 'watched' ? 'dashed' : 'solid',
                  borderRadius: radius.sm,
                  transform: [{ scale: pressed ? 0.93 : 1 }],
                },
              ]}
              accessibilityLabel={`${date}, ${morning} trains ouverts le matin, ${afternoon} après midi${
                mark === 'booked' ? ', train réservé' : mark === 'watched' ? ', créneau suivi' : ''
              }`}
            >
              {/* Le jour en gros, et la couleur dit quand.
                  Le compte de la journee etait le plus gros caractere de la
                  case, et redisait ce que la couleur disait deja ; il est sur
                  l'ecran du jour. Une case qui paraissait bonne cachait une
                  fois sur cinq une demi-journee vide — celle du « jeudi
                  soir ». Matin a gauche, apres-midi a droite : l'heure se lit
                  dans le sens de la lecture, sans legende. */}
              <Text style={[styles.dayNumber, { color: theme.text }]}>{dayNumber(date)}</Text>
              <View style={styles.halves}>
                {day.halves.map((count, i) => (
                  <View
                    key={i}
                    style={[styles.half, { backgroundColor: theme.avail[availabilityBucket(count)] }]}
                  />
                ))}
              </View>
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
  weekdays: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  weekday: { ...typo.chip, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { justifyContent: 'space-between', overflow: 'hidden', borderWidth: 2, padding: 3 },
  dayNumber: { ...typo.title, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  halves: { flexDirection: 'row', gap: 2, height: '42%' },
  half: { flex: 1, borderRadius: 4 },
});
