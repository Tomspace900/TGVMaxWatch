import { useMemo } from 'react';
import { weekday } from '../../../src/dates.ts';
import { slotOf } from '../../../src/stats.ts';
import { dirLabel, longDate } from '../lib/format.ts';
import { sncfConnectUrl } from '../config/deeplink.ts';
import { Sparkline } from './Sparkline.tsx';
import { TrainRow } from './TrainRow.tsx';
import type { Day } from '../lib/model.ts';
import type { History, Reservations, Stats, Watchlist } from '../../../src/types.ts';
import styles from './DayDetail.module.css';

interface Props {
  day: Day;
  history: History;
  stats: Stats | null;
  watchlist: Watchlist;
  reservations: Reservations;
  onWatch: (train: string, depart: string) => void;
  onBook: (day: Day, trainNo: string) => void;
}

export function DayDetail({
  day,
  history,
  stats,
  watchlist,
  reservations,
  onWatch,
  onBook,
}: Props) {
  const series = history[day.date]?.[day.dir] ?? [];

  const watchedDate = watchlist.watch.some(
    (entry) => entry.date === day.date && (!entry.dir || entry.dir === day.dir),
  );

  const booked = new Set(
    reservations.slots
      .filter((slot) => slot.date === day.date && slot.dir === day.dir)
      .map((slot) => slot.trainNo),
  );

  const forecast = useMemo(() => buildForecast(day, stats), [day, stats]);

  return (
    <>
      <div className={styles.header}>
        <span className={styles.date}>{longDate(day.date)}</span>
        <span className={styles.dir}>{dirLabel(day.dir)}</span>
      </div>

      <div className={styles.summary}>
        <span className={styles.big}>{day.available}</span>
        <span className={styles.label}>
          {day.available === 0
            ? 'aucune place'
            : `place${day.available > 1 ? 's' : ''} sur ${day.trains.length} trains`}
          {day.onlyLong && ' — toutes sur des trains longs'}
        </span>
        {series.length >= 2 && (
          <span className={styles.chart}>
            <Sparkline series={series} />
          </span>
        )}
      </div>

      {forecast && <p className={styles.forecast}>{forecast}</p>}

      {day.trains.length === 0 ? (
        <p className={styles.empty}>Aucun train connu pour ce jour.</p>
      ) : (
        <>
          {day.trains.map((train) => (
            <TrainRow
              key={`${train.trainNo}-${train.depart}`}
              train={train}
              watched={watchedDate}
              booked={booked.has(train.trainNo)}
              onWatch={() => onWatch(train.trainNo, train.depart)}
              onBook={() => onBook(day, train.trainNo)}
            />
          ))}
          <p className={styles.hint}>
            Glisser une ligne vers la gauche pour surveiller, vers la droite apres avoir reserve.
          </p>

          {/* SNCF Connect n'expose aucun lien profond : on ouvre l'accueil et
              la recherche se refait a la main. */}
          <a className={styles.link} href={sncfConnectUrl()} target="_blank" rel="noreferrer">
            Ouvrir SNCF Connect
          </a>
        </>
      )}
    </>
  );
}

/**
 * Prevision, uniquement quand l'echantillon la justifie.
 *
 * On affiche toujours la taille d'echantillon : une mediane sur trois
 * observations et une mediane sur trente ne se lisent pas de la meme facon.
 */
function buildForecast(day: Day, stats: Stats | null): string | null {
  if (!stats?.ready) return null;

  const first = day.trains.find((train) => train.available);
  if (!first) return null;

  const row = stats.burnRate.find(
    (entry) =>
      entry.weekday === weekday(day.date) &&
      entry.dir === day.dir &&
      entry.slot === slotOf(first.depart),
  );
  if (!row) return null;

  return `Ce creneau part en general en ${row.medianDays} jour${
    row.medianDays > 1 ? 's' : ''
  } — sur ${row.sample} observations.`;
}
