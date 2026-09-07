import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { daysBetween, weekdayKey } from '../../../src/dates.ts';
import { trainsWord } from '../../../src/label.ts';
import { isNotable, traceVerdict, verdictLabel } from '../../../src/trace.ts';
import { isExpired } from '../../../src/watchlist.ts';
import { dirLabel, longDate, watchCutoff, weekdayName } from '../format.ts';
import { horizonDates, type Calendar, type Train } from '../model.ts';
import { SwipeRow } from './SwipeRow.tsx';
import { WatchedChip } from './TrainRow.tsx';
import { radius, space, typo, useTheme } from '../theme.ts';
import type {
  Reservations,
  TrainTrends,
  WatchEntry,
  Watchlist,
  WatchRule,
} from '../../../src/types.ts';

/**
 * Ce qui est surveille, en entier et en tete de l'ecran.
 *
 * C'est le coeur du produit, et il vivait dans une carte de quatre lignes sous
 * trente cases de calendrier, tronquee sans le dire, sans le sens de chaque
 * entree — l'information la plus discriminante — et sans autre etat qu'un
 * code-barres a decoder.
 *
 * Les memes gestes que dans la liste d'un jour : vers la gauche pour ne plus
 * suivre, vers la droite apres avoir reserve. Un geste qui marche a un endroit
 * et pas a l'autre est un geste qu'on cesse d'essayer.
 */

interface Props {
  watchlist: Watchlist;
  calendar: Calendar;
  trains: TrainTrends;
  reservations: Reservations;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onManage: () => void;
  onRemoveEntry: (entry: WatchEntry) => void;
  onRemoveRule: (rule: WatchRule) => void;
  onBook: (date: string, dir: string, train: Train, booked: boolean) => void;
}

export function WatchList({
  watchlist,
  calendar,
  trains,
  reservations,
  today,
  onOpen,
  onManage,
  onRemoveEntry,
  onRemoveRule,
  onBook,
}: Props) {
  const theme = useTheme();
  const dates = useMemo(() => horizonDates(today), [today]);

  /*
   * Ce qui est parti ne s'affiche plus.
   *
   * Une entree dont le train est passe ne dit plus rien et la liste
   * s'allongerait indefiniment. Le filtre est immediat ; le nettoyage du
   * fichier, lui, se fait a la prochaine ecriture — on n'ecrit pas dans le
   * depot juste parce qu'un ecran s'est affiche.
   */
  const entries = useMemo(() => {
    const cutoff = watchCutoff();
    return watchlist.watch
      .filter((entry) => !isExpired(entry, cutoff))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.after ?? '').localeCompare(b.after ?? ''));
  }, [watchlist.watch]);

  const booked = useMemo(
    () => new Set(reservations.slots.map((slot) => `${slot.date}|${slot.dir}|${slot.trainNo}`)),
    [reservations.slots],
  );

  const total = entries.length + watchlist.rules.length;

  return (
    <View style={styles.block}>
      <Pressable onPress={onManage} style={styles.head} hitSlop={8}>
        <Text style={[typo.title, { color: theme.text }]}>Surveillance</Text>
        <Text style={[typo.digits, { color: theme.muted }]}>
          {total === 0 ? 'rien' : `${total} suivi${total > 1 ? 's' : ''}`}
        </Text>
      </Pressable>

      {total === 0 && (
        <Text style={[typo.body, { color: theme.muted, lineHeight: 20, marginTop: space.sm }]}>
          Rien de surveillé : seules les deux alertes générales partiront. Ouvre un jour et balaie
          un train vers la gauche pour le suivre.
        </Text>
      )}

      {entries.map((entry) => (
        <EntryRow
          key={`${entry.date}-${entry.dir ?? ''}-${entry.after ?? ''}`}
          entry={entry}
          calendar={calendar}
          trains={trains}
          booked={booked}
          today={today}
          onOpen={onOpen}
          onManage={onManage}
          onRemove={() => onRemoveEntry(entry)}
          onBook={onBook}
        />
      ))}

      {watchlist.rules.map((rule) => {
        /*
         * Une regle recurrente ne designe pas une date : elle en designe une par
         * semaine. Ce qu'on veut savoir devant elle, c'est ou en est la
         * prochaine — sinon la ligne ne dit que ce qu'on a soi-meme ecrit.
         */
        const nextDate = dates.find((date) => weekdayKey(date) === rule.weekday);
        const nextDay = nextDate && rule.dir ? calendar.get(nextDate)?.get(rule.dir) : undefined;

        return (
          <SwipeRow
            key={`rule-${rule.weekday}-${rule.dir ?? ''}-${rule.after ?? ''}`}
            left={{ label: 'NE PLUS SUIVRE', onAction: () => onRemoveRule(rule) }}
          >
            <Pressable
              onPress={() => (nextDate && rule.dir ? onOpen(nextDate, rule.dir) : onManage())}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.raised,
                  borderColor: theme.line,
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[typo.chip, styles.lead, { color: theme.muted, backgroundColor: theme.sunken }]}
              >
                RÈGLE
              </Text>

              <View style={styles.body}>
                <Text style={[typo.section, { color: theme.text }]} numberOfLines={1}>
                  chaque {weekdayName(rule.weekday)}
                  {rule.after ? ` après ${rule.after}` : ''}
                </Text>
                <Text style={[typo.small, { color: theme.muted }]} numberOfLines={1}>
                  {rule.dir ? dirLabel(rule.dir) : 'les deux sens'}
                  {nextDate ? ` · prochain ${longDate(nextDate)}` : ''}
                  {nextDay ? ` · ${countLabel(nextDay.available)}` : ''}
                </Text>
              </View>
            </Pressable>
          </SwipeRow>
        );
      })}
    </View>
  );
}

function countLabel(available: number): string {
  return available === 0 ? 'aucun train ouvert' : `${available} ${trainsWord(available)} ouverts`;
}

function EntryRow({
  entry,
  calendar,
  trains,
  booked,
  today,
  onOpen,
  onManage,
  onRemove,
  onBook,
}: {
  entry: WatchEntry;
  calendar: Calendar;
  trains: TrainTrends;
  booked: Set<string>;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onManage: () => void;
  onRemove: () => void;
  onBook: (date: string, dir: string, train: Train, booked: boolean) => void;
}) {
  const theme = useTheme();

  const day = entry.dir ? calendar.get(entry.date)?.get(entry.dir) : undefined;
  const train = entry.after ? day?.trains.find((item) => item.depart === entry.after) : undefined;

  /*
   * Une entree porte une heure de depart : ce qu'on veut savoir devant elle,
   * c'est si *ce train-la* tient. Sans heure, elle porte la journee entiere, et
   * le compte du jour redevient la bonne reponse.
   */
  const verdict = train
    ? traceVerdict(trains.series[`${entry.date}|${entry.dir}`]?.[train.trainNo])
    : null;
  const state = verdict
    ? verdict.kind === 'inconnu'
      ? train?.available
        ? 'ouvert'
        : 'complet'
      : verdictLabel(verdict)
    : day
      ? countLabel(day.available)
      : '—';

  const left = daysBetween(today, entry.date);
  const isBooked = Boolean(train && entry.dir && booked.has(`${entry.date}|${entry.dir}|${train.trainNo}`));

  return (
    <SwipeRow
      left={{ label: 'NE PLUS SUIVRE', onAction: onRemove }}
      // « J'ai reserve » n'a de sens que sur un train identifie : une journee
      // entiere ne se reserve pas.
      {...(train && entry.dir
        ? {
            right: {
              label: isBooked ? 'PLUS RÉSERVÉ' : "J'AI RÉSERVÉ",
              onAction: () => onBook(entry.date, entry.dir!, train, isBooked),
            },
          }
        : {})}
    >
      <Pressable
        onPress={() => (entry.dir ? onOpen(entry.date, entry.dir) : onManage())}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.raised,
            borderColor: theme.line,
            borderRadius: radius.sm,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        {entry.after ? (
          <Text style={[typo.clock, styles.leadTime, { color: theme.text }]}>{entry.after}</Text>
        ) : (
          <Text style={[typo.chip, styles.lead, { color: theme.muted, backgroundColor: theme.sunken }]}>
            JOUR
          </Text>
        )}

        <View style={styles.body}>
          <View style={styles.line}>
            <Text style={[typo.section, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {longDate(entry.date)}
            </Text>
            {/* Pas de badge « suivi » ici : tout ce que cette liste montre est
                suivi par definition, et un signal present sur chaque ligne est
                un fond. Seule la reservation apprend quelque chose. */}
            <WatchedChip watched={false} booked={isBooked} />
            {/* La distance au depart decide autant que l'etat : « complet » a
                J-20 et « complet » a J-2 ne se lisent pas pareil. */}
            <Text style={[typo.digits, { color: theme.muted }]}>
              {left === 0 ? "aujourd'hui" : `J-${left}`}
            </Text>
          </View>

          <Text
            style={[
              verdict && isNotable(verdict) ? typo.strong : typo.small,
              { color: verdict && isNotable(verdict) ? theme.text : theme.muted },
            ]}
            numberOfLines={1}
          >
            {entry.dir ? `${dirLabel(entry.dir)} · ` : 'les deux sens · '}
            {state}
          </Text>
        </View>
      </Pressable>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.lg, gap: space.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  /*
   * Le meme objet que dans la liste d'un jour.
   *
   * Ces lignes etaient plates, separees par un filet ; le meme balayage y
   * revelait un degrade sur toute la largeur, sans coin ni marge — le geste
   * etait identique, l'objet non, et ca se voyait. Un geste qui se fait sur
   * deux formes differentes se lit comme deux gestes.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  leadTime: { minWidth: 58 },
  lead: {
    minWidth: 58,
    textAlign: 'center',
    overflow: 'hidden',
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  body: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
