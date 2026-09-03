import { APP_URL, STATION_LABELS } from './config.ts';
import { formatDuration } from './duration.ts';
import type { NewDate, TrainEvent } from './types.ts';

/** Contenu d'une notification, tel qu'envoye au service worker. */
export interface Notification {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Nombre de lignes detaillees avant de basculer sur un « et N autres ». */
const MAX_LINES = 6;

/** Horaires listes par groupe avant de basculer sur un « +N ». */
const MAX_TIMES = 4;

/** Le payload d'un Web Push est plafonne aux alentours de 4 ko. */
const MAX_PAYLOAD_BYTES = 3_500;

export function dirLabel(dir: string): string {
  const [from = '', to = ''] = dir.split('>');
  return `${STATION_LABELS[from] ?? from} > ${STATION_LABELS[to] ?? to}`;
}

/** `2026-10-17` -> `17/10`. Format court, la notification est lue d'un oeil. */
export function shortDate(iso: string): string {
  const [, month = '', day = ''] = iso.split('-');
  return `${day}/${month}`;
}

/**
 * Construit l'unique message d'une execution.
 *
 * Un seul message groupe par run, et aucun message si rien ne matche : c'est
 * la condition pour que la notification garde du sens. Les suppressions de
 * train (`REMOVED`) restent dans les donnees mais ne sont pas poussees, elles
 * generent trop de bruit pour l'interet qu'elles ont sur le moment.
 */
export function buildNotification(
  events: TrainEvent[],
  newDates: NewDate[],
): Notification | null {
  const opens = events.filter((event) => event.kind === 'OPEN');
  const closes = events.filter((event) => event.kind === 'CLOSE');

  /*
   * Une date qui entre a J+30 sans une seule place n'est pas une nouvelle : il
   * n'y a rien a reserver, et le titre des dates entrantes etant prioritaire,
   * elle masquerait les ouvertures reelles du meme run derriere un « 0 train ».
   * C'est le cas courant, pas le cas limite : le 2026-10-03 est entre avec
   * soixante-deux trains, tous complets.
   */
  const opened = newDates.filter((entry) => entry.oui > 0);

  if (opens.length === 0 && closes.length === 0 && opened.length === 0) return null;

  const title = buildTitle(opens.length, closes.length, opened);
  const lines: string[] = [];

  for (const entry of opened) {
    lines.push(
      `J+30 ${shortDate(entry.date)} ${dirLabel(entry.dir)} : ${entry.oui} train${
        entry.oui > 1 ? 's' : ''
      }`,
    );
  }

  lines.push(...group(opens));
  lines.push(...group(closes, 'parti '));

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > shown.length) {
    shown.push(`+${lines.length - shown.length} autres`);
  }

  const focus = opened[0] ?? opens[0] ?? closes[0];
  const url = focus
    ? `${APP_URL}?date=${focus.date}&dir=${encodeURIComponent(focus.dir)}`
    : APP_URL;

  return truncate({ title, body: shown.join('\n'), url, tag: 'tgvmax' });
}

/**
 * Une ligne par date et par sens, les horaires a la suite.
 *
 * Une ligne par train repetait la date a chaque fois et donnait le numero,
 * qui n'aide pas d'un coup d'oeil — mais omettait le sens, qui est la seule
 * chose qu'on ne peut pas deviner et qui decide s'il faut ouvrir ou non.
 *
 * La duree ne sort que sur les trains longs, et en clair : ailleurs elle est
 * previsible et occupe la place des horaires, tandis qu'un « 3h30 » a cote d'un
 * trajet habituellement en 2h05 est l'avertissement, sans avoir a le nommer.
 */
function group(events: TrainEvent[], prefix = ''): string[] {
  const groups = new Map<string, TrainEvent[]>();

  for (const event of events) {
    const key = `${event.date}|${event.dir}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  return [...groups.values()].map((bucket) => {
    const first = bucket[0]!;

    /*
     * Deux trains peuvent partir a la meme minute — le 06/09, les 8473 et 8505
     * partent a 10:41 et arrivent a 12:45. La ligne liste des horaires de
     * depart, pas des trains : repeter « 10:41 10:41 » se lit comme un defaut
     * d'affichage sans rien apprendre de plus.
     */
    const unique = bucket.filter(
      (event, index) => bucket.findIndex((other) => other.depart === event.depart) === index,
    );

    const times = unique
      .slice(0, MAX_TIMES)
      .map(
        (event) =>
          `${event.depart}${
            event.tier === 'long' ? ` (${formatDuration(event.durationMin)})` : ''
          }`,
      );
    const rest = unique.length - times.length;

    return `${prefix}${shortDate(first.date)} ${dirLabel(first.dir)} ${times.join(' ')}${
      rest > 0 ? ` +${rest}` : ''
    }`;
  });
}

function buildTitle(opens: number, closes: number, opened: NewDate[]): string {
  if (opened.length > 0) {
    const total = opened.reduce((sum, entry) => sum + entry.oui, 0);
    return `Nouvelle date a J+30 : ${total} train${total > 1 ? 's' : ''}`;
  }
  if (opens > 0) {
    return `${opens} place${opens > 1 ? 's' : ''} ouverte${opens > 1 ? 's' : ''}`;
  }
  return `${closes} train${closes > 1 ? 's' : ''} parti${closes > 1 ? 's' : ''}`;
}

/** Coupe le corps si le payload depasse la limite du service push. */
function truncate(notification: Notification): Notification {
  let body = notification.body;

  while (Buffer.byteLength(JSON.stringify({ ...notification, body })) > MAX_PAYLOAD_BYTES) {
    const cut = body.lastIndexOf('\n');
    if (cut <= 0) return { ...notification, body: body.slice(0, 200) };
    body = body.slice(0, cut);
  }

  return { ...notification, body };
}
