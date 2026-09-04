import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_RESERVATIONS } from '../../../src/config.ts';
import { todayInParis } from '../../../src/dates.ts';
import { trainsLabel } from '../../../src/label.ts';
import { dirLabel, longDate, weekdayName } from '../format.ts';
import { trainNoAt, type Calendar } from '../model.ts';
import { Trace } from './Trace.tsx';
import { Wagon } from './rail.tsx';
import { radius, space, typo, useTheme } from '../theme.ts';
import type { Reservations, TrainTrends, Watchlist } from '../../../src/types.ts';

/**
 * Les cartes du bas de l'écran calendrier.
 *
 * Sept colonnes de trente cases ne peuvent pas, géométriquement, remplir un
 * écran de téléphone. Plutôt que d'agrandir les cases jusqu'à l'absurde ou de
 * laisser un vide, le bas porte ce qui est toujours disponible et propre à
 * l'utilisateur : son quota et ce qu'il surveille.
 */

/** Recouvrement de deux voitures, qui les fait lire comme attelées. */
const COUPLING = 5;
const CAR_RATIO = 118 / 52;

export function QuotaCard({
  reservations,
  onPress,
}: {
  reservations: Reservations;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  /*
   * Le quota TGVmax porte sur les reservations *simultanees* : un creneau se
   * libere quand le train est passe. Les voyages deja faits restent dans la
   * liste — c'est un historique qu'on ne jette pas — mais les compter afficherait
   * « 6 sur 6 » avec un quota reel vide.
   */
  const today = todayInParis();
  const upcoming = reservations.slots.filter((slot) => slot.date >= today);
  const used = upcoming.length;

  /*
   * Six voitures, une par reservation simultanee autorisee.
   *
   * La taille se deduit de la largeur reelle de la carte plutot que d'etre
   * fixee : six silhouettes calibrees pour un ecran donne debordent sur le
   * suivant, et un SVG ne se laisse pas comprimer par le flex.
   */
  const carWidth = width > 0 ? (width + COUPLING * (MAX_RESERVATIONS - 1)) / MAX_RESERVATIONS : 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[typo.section, { color: theme.text }]}>Réservations</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>
          {used} / {MAX_RESERVATIONS}
        </Text>
      </View>

      <View
        style={styles.rame}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {carWidth > 0 &&
          Array.from({ length: MAX_RESERVATIONS }, (_, i) => (
            <View key={i} style={i === 0 ? null : { marginLeft: -COUPLING }}>
              <Wagon height={carWidth / CAR_RATIO} filled={i < used} />
            </View>
          ))}
      </View>

      {used === 0 ? (
        <Text style={[typo.small, { color: theme.muted, lineHeight: 18 }]}>
          Aucun créneau occupé. Balaie une ligne de train vers la droite après avoir réservé.
        </Text>
      ) : (
        upcoming.slice(0, 3).map((slot) => (
          <View key={`${slot.date}-${slot.trainNo}`} style={styles.row}>
            <Text style={[typo.digits, { color: theme.text }]}>{slot.depart}</Text>
            <Text style={[typo.body, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {longDate(slot.date)}
            </Text>
            <Text style={[typo.small, { color: theme.muted }]}>{dirLabel(slot.dir)}</Text>
          </View>
        ))
      )}
    </Pressable>
  );
}

export function WatchCard({
  watchlist,
  calendar,
  trains,
  onPress,
}: {
  watchlist: Watchlist;
  calendar: Calendar;
  trains: TrainTrends;
  onPress: () => void;
}) {
  const theme = useTheme();
  const total = watchlist.watch.length + watchlist.rules.length;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[typo.section, { color: theme.text }]}>Surveillance</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>
          {total === 0 ? '—' : `${total}`}
        </Text>
      </View>

      {total === 0 && (
        <Text style={[typo.small, { color: theme.muted, lineHeight: 18 }]}>
          Rien de surveillé : aucune alerte ne partira. Balaie un train vers la gauche pour le
          suivre.
        </Text>
      )}

      {watchlist.watch.slice(0, 4).map((entry) => {
        const day = entry.dir ? calendar.get(entry.date)?.get(entry.dir) : undefined;

        /*
         * Une entree porte une heure de depart : ce qu'on veut savoir devant
         * elle, c'est si *ce train-la* tient ou s'il vient de rouvrir, pas
         * combien de trains circulent ce jour-la. Le compte du jour etait la
         * reponse a une question que personne ne pose ici — « 8 » en face du
         * 07h12 se lisait meme comme huit places dans ce train.
         *
         * Sans heure, l'entree porte la journee entiere : le compte redevient
         * alors la bonne reponse.
         */
        const trainNo =
          entry.after && entry.dir
            ? trainNoAt(calendar, entry.date, entry.dir, entry.after)
            : null;
        const trace =
          trainNo && entry.dir ? trains.series[`${entry.date}|${entry.dir}`]?.[trainNo] : undefined;

        return (
          <View key={`${entry.date}-${entry.after ?? ''}`} style={styles.row}>
            {entry.after && (
              <Text style={[typo.digits, { color: theme.text }]}>{entry.after}</Text>
            )}
            <Text style={[typo.body, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {longDate(entry.date)}
            </Text>
            {trace ? (
              <Trace trace={trace} />
            ) : (
              <Text style={[typo.small, { color: theme.muted }]}>
                {day ? trainsLabel(day.available) : '—'}
              </Text>
            )}
          </View>
        );
      })}

      {watchlist.watch.length > 0 && (
        <Text style={[typo.small, { color: theme.muted }]}>
          Jour par jour, du plus ancien au plus récent : plein = ouvert au TGVmax.
        </Text>
      )}

      {watchlist.rules.slice(0, 2).map((rule, index) => (
        <Text key={`rule-${index}`} style={[typo.body, { color: theme.muted }]}>
          chaque {weekdayName(rule.weekday)}
          {rule.after ? ` après ${rule.after}` : ''}
        </Text>
      ))}
    </Pressable>
  );
}

/** Accès à l'érosion, publiée seulement quand l'archive couvre une arche entière. */
export function StatsCard({
  snapshotCount,
  onPress,
}: {
  snapshotCount: number;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      <View style={styles.head}>
        <Text style={[typo.section, { color: theme.text }]}>Érosion et prévisions</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>{snapshotCount} j</Text>
      </View>
      <Text style={[typo.small, { color: theme.muted }]}>
        Ce que la source ne garde pas : la vitesse à laquelle une date se vide.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rame: { flexDirection: 'row', alignItems: 'center', marginVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
