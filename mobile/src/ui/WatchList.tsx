import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { daysBetween, weekdayKey } from '../../../src/dates.ts';
import { trainsWord } from '../../../src/label.ts';
import { isNotable, traceVerdict, verdictLabel } from '../../../src/trace.ts';
import { dirLabel, longDate, weekdayName } from '../format.ts';
import { horizonDates, type Calendar } from '../model.ts';
import { radius, space, typo, useTheme } from '../theme.ts';
import type { TrainTrends, WatchEntry, Watchlist } from '../../../src/types.ts';

/**
 * Ce qui est surveille, en entier et en tete de l'ecran.
 *
 * C'est le coeur du produit, et il vivait dans une carte de quatre lignes sous
 * trente cases de calendrier, tronquee sans le dire, sans le sens de chaque
 * entree — c'est-a-dire sans l'information la plus discriminante — et sans
 * autre etat qu'un code-barres a decoder.
 *
 * Trois choses ont change. Il est **au-dessus du calendrier**, parce qu'une
 * session dure trente secondes et que c'est ce qu'on vient chercher. Il montre
 * **tout**, parce qu'une liste coupee en silence est une information qui
 * disparait. Et chaque ligne porte **son sens** : la question du perimetre —
 * cette carte suit-elle le selecteur du haut ou non ? — ne se pose plus, chaque
 * ligne repond pour elle-meme.
 */

interface Props {
  watchlist: Watchlist;
  calendar: Calendar;
  trains: TrainTrends;
  today: string;
  onOpen: (date: string, dir: string) => void;
  onManage: () => void;
}

export function WatchList({ watchlist, calendar, trains, today, onOpen, onManage }: Props) {
  const theme = useTheme();
  const total = watchlist.watch.length + watchlist.rules.length;

  const dates = useMemo(() => horizonDates(today), [today]);

  /*
   * Ordre chronologique, le plus proche en tete : c'est l'ordre dans lequel les
   * echeances arrivent, et donc celui dans lequel on les lit. La watchlist,
   * elle, est dans l'ordre ou les entrees ont ete posees, ce qui ne veut rien
   * dire une fois qu'on en a quatre.
   */
  const entries = useMemo(
    () => [...watchlist.watch].sort((a, b) => a.date.localeCompare(b.date)),
    [watchlist.watch],
  );

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

      {entries.map((entry, index) => (
        <EntryRow
          key={`${entry.date}-${entry.dir ?? ''}-${entry.after ?? ''}`}
          entry={entry}
          calendar={calendar}
          trains={trains}
          today={today}
          first={index === 0}
          onOpen={onOpen}
          onManage={onManage}
        />
      ))}

      {watchlist.rules.map((rule, index) => {
        /*
         * Une regle recurrente ne designe pas une date : elle en designe une par
         * semaine. Ce qu'on veut savoir devant elle, c'est ou en est la
         * prochaine — sinon la ligne ne dit que ce qu'on a soi-meme ecrit.
         */
        const nextDate = dates.find((date) => weekdayKey(date) === rule.weekday);
        const nextDay =
          nextDate && rule.dir ? calendar.get(nextDate)?.get(rule.dir) : undefined;

        return (
          <Pressable
            key={`rule-${index}`}
            onPress={() => (nextDate && rule.dir ? onOpen(nextDate, rule.dir) : onManage())}
            style={({ pressed }) => [
              styles.row,
              { borderTopColor: theme.line, opacity: pressed ? 0.6 : 1 },
              entries.length === 0 && index === 0 ? styles.firstRow : null,
            ]}
          >
            <Text style={[typo.chip, styles.lead, { color: theme.muted, backgroundColor: theme.sunken }]}>
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
  today,
  first,
  onOpen,
  onManage,
}: {
  entry: WatchEntry;
  calendar: Calendar;
  trains: TrainTrends;
  today: string;
  first: boolean;
  onOpen: (date: string, dir: string) => void;
  onManage: () => void;
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

  return (
    <Pressable
      onPress={() => (entry.dir ? onOpen(entry.date, entry.dir) : onManage())}
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: theme.line, opacity: pressed ? 0.6 : 1 },
        first ? styles.firstRow : null,
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
          {/* La distance au depart decide autant que l'etat : « complet » a
              J-20 et « complet » a J-2 ne se lisent pas pareil. */}
          <Text style={[typo.digits, { color: theme.muted }]}>
            {left < 0 ? 'passé' : left === 0 ? "aujourd'hui" : `J-${left}`}
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
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // La premiere ligne n'a pas de filet : le titre en tient lieu.
  firstRow: { borderTopWidth: 0, paddingTop: space.sm },
  leadTime: { minWidth: 58 },
  lead: {
    minWidth: 58,
    textAlign: 'center',
    overflow: 'hidden',
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  body: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});
