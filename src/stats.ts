import { HISTORY_RETENTION_DAYS, MIN_EROSION_SPAN } from './config.ts';
import { addDays, daysBetween, weekday } from './dates.ts';
import { recordDir, recordKey } from './duration.ts';
import type {
  BurnRate,
  ErosionCurve,
  ReopenStat,
  Snapshot,
  Stats,
  Availability,
} from './types.ts';

/** Nombre minimal d'observations avant de publier un chiffre par train. */
const MIN_REOPEN_SAMPLE = 5;
/** Nombre minimal d'instances avant de publier une mediane de fonte. */
const MIN_BURN_SAMPLE = 3;

interface Timeline {
  date: string;
  dir: string;
  trainNo: string;
  depart: string;
  /** Observations dans l'ordre chronologique de collecte. */
  points: { d: string; a: Availability }[];
}

export interface StatsBuilder {
  add(collectionDate: string, snapshot: Snapshot): void;
  finish(today: string, snapshotCount: number): Stats;
}

/**
 * Statistiques derivees de l'archive.
 *
 * Tout ce qui est calcule ici est impossible sans historique : la source
 * ecrase son dataset chaque jour et ne conserve aucune trace du passe. C'est
 * la valeur propre du projet.
 */
export function createStatsBuilder(today: string): StatsBuilder {
  const timelines = new Map<string, Timeline>();
  // On borne la memoire sur la meme fenetre que `history.json`.
  const floor = addDays(today, -HISTORY_RETENTION_DAYS);

  return {
    add(collectionDate, snapshot) {
      for (const record of snapshot) {
        if (record.date < floor) continue;

        const key = recordKey(record);
        let timeline = timelines.get(key);
        if (!timeline) {
          timeline = {
            date: record.date,
            dir: recordDir(record),
            trainNo: record.train_no,
            depart: record.heure_depart,
            points: [],
          };
          timelines.set(key, timeline);
        }
        timeline.points.push({ d: collectionDate, a: record.od_happy_card });
      }
    },

    /*
     * Chaque metrique est calculee, puis publiee si elle a survecu a sa propre
     * garde d'echantillon. Un seuil global cale sur huit semaines retenait une
     * courbe d'erosion deja lisible au bout d'un mois, et un taux de
     * reouverture deja fonde sur cinq fermetures.
     *
     * La regle de fond ne bouge pas : jamais d'estimation inventee, et toujours
     * la taille d'echantillon a cote du chiffre.
     */
    finish(finishToday, snapshotCount) {
      const all = [...timelines.values()];
      const burnRate = computeBurnRate(all, finishToday);
      const reopen = computeReopen(all);
      const erosion = computeErosion(all, finishToday);

      return {
        generatedAt: new Date().toISOString(),
        snapshotCount,
        ready: {
          burnRate: burnRate.length > 0,
          reopen: Object.keys(reopen).length > 0,
          erosion: erosion.length > 0,
        },
        burnRate,
        reopen,
        erosion,
      };
    },
  };
}

/**
 * A combien de jours du depart un train passe a NON.
 *
 * On mesurait auparavant le delai depuis la **premiere observation**, ce qui
 * prenait pour origine la date a laquelle l'archive avait commence a regarder :
 * pour toute date de voyage deja presente dans la fenetre au demarrage, une
 * fonte de vingt-cinq jours en rapportait deux. Le commentaire d'origine
 * traitait soigneusement la censure a droite et ignorait cette troncature a
 * gauche.
 *
 * La distance au depart, elle, est definie pour toute serie quelle que soit sa
 * date d'entree dans l'observation — immunisee contre la troncature au lieu
 * d'etre protegee d'elle — et se lit directement : « les vendredis 19h partent
 * vers J-18 » est une consigne, « partent en 12 jours » n'en est pas une.
 *
 * On n'utilise que des dates de voyage deja passees. Une date a venir n'a pas
 * eu toute sa chance de se fermer : ne compter que celles qui se sont deja
 * fermees selectionnerait les plus rapides et biaiserait la mediane.
 */
function computeBurnRate(timelines: Timeline[], today: string): BurnRate[] {
  const groups = new Map<string, number[]>();

  for (const timeline of timelines) {
    if (timeline.date >= today) continue;

    const first = timeline.points[0];
    if (!first || first.a !== 'OUI') continue;

    const closed = timeline.points.find((point) => point.a === 'NON');
    if (!closed) continue;

    const key = `${weekday(timeline.date)}|${slotOf(timeline.depart)}|${timeline.dir}`;
    const values = groups.get(key) ?? [];
    values.push(daysBetween(closed.d, timeline.date));
    groups.set(key, values);
  }

  const rows: BurnRate[] = [];
  for (const [key, values] of groups) {
    if (values.length < MIN_BURN_SAMPLE) continue;
    const [day, slot, dir] = key.split('|') as [string, string, string];
    rows.push({
      weekday: Number(day),
      slot,
      dir,
      medianDaysBefore: median(values),
      sample: values.length,
    });
  }

  return rows.sort((a, b) => a.weekday - b.weekday || a.slot.localeCompare(b.slot));
}

/**
 * Taux de reouverture par numero de train.
 *
 * Transforme un « complet » en « attends, celui-la revient dans 7 cas sur 10 ».
 */
function computeReopen(timelines: Timeline[]): Record<string, ReopenStat> {
  const counters = new Map<string, { closed: number; reopened: number }>();

  for (const timeline of timelines) {
    let sawClose = false;
    let sawReopen = false;

    for (let i = 1; i < timeline.points.length; i++) {
      const previous = timeline.points[i - 1]!.a;
      const current = timeline.points[i]!.a;
      if (previous === 'OUI' && current === 'NON') sawClose = true;
      if (sawClose && previous === 'NON' && current === 'OUI') sawReopen = true;
    }

    if (!sawClose) continue;
    const counter = counters.get(timeline.trainNo) ?? { closed: 0, reopened: 0 };
    counter.closed++;
    if (sawReopen) counter.reopened++;
    counters.set(timeline.trainNo, counter);
  }

  const stats: Record<string, ReopenStat> = {};
  for (const [trainNo, counter] of counters) {
    if (counter.closed < MIN_REOPEN_SAMPLE) continue;
    stats[trainNo] = {
      closed: counter.closed,
      reopened: counter.reopened,
      rate: counter.reopened / counter.closed,
      sample: counter.closed,
    };
  }

  return stats;
}

/**
 * Courbe d'erosion J-30 -> J-0 : nombre moyen de trains eligibles restants a
 * chaque distance du depart, par jour de semaine et par sens.
 */
function computeErosion(timelines: Timeline[], today: string): ErosionCurve[] {
  // [weekday|dir][daysBefore] -> { disponibles, observations }
  const grid = new Map<string, Map<number, { oui: number; n: number }>>();

  for (const timeline of timelines) {
    if (timeline.date >= today) continue;
    const key = `${weekday(timeline.date)}|${timeline.dir}`;
    const byDistance = grid.get(key) ?? new Map<number, { oui: number; n: number }>();
    grid.set(key, byDistance);

    for (const point of timeline.points) {
      const daysBefore = daysBetween(point.d, timeline.date);
      if (daysBefore < 0 || daysBefore > 30) continue;
      const cell = byDistance.get(daysBefore) ?? { oui: 0, n: 0 };
      cell.n++;
      if (point.a === 'OUI') cell.oui++;
      byDistance.set(daysBefore, cell);
    }
  }

  const curves: ErosionCurve[] = [];
  for (const [key, byDistance] of grid) {
    const [day, dir] = key.split('|') as [string, string];
    const points = [...byDistance.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([daysBefore, cell]) => ({
        daysBefore,
        avg: cell.n === 0 ? 0 : cell.oui / cell.n,
        sample: cell.n,
      }));

    /*
     * Une courbe doit couvrir la fenetre pour meriter son nom. Au demarrage de
     * l'archive, les seules dates de voyage deja passees sont celles des
     * premiers jours : leurs points se collent a J-0 et dessinent trois pixels
     * qu'on lirait comme une erosion.
     */
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last || last.daysBefore - first.daysBefore < MIN_EROSION_SPAN) continue;

    curves.push({ weekday: Number(day), dir, points });
  }

  return curves.sort((a, b) => a.weekday - b.weekday || a.dir.localeCompare(b.dir));
}

/** Tranche horaire de depart, arrondie a deux heures : `06`, `08`, `16`... */
export function slotOf(depart: string): string {
  const hour = Number(depart.slice(0, 2));
  return String(hour - (hour % 2)).padStart(2, '0');
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}
