import { APP_URL, STATION_LABELS } from './config.ts';
import { formatDuration } from './duration.ts';
import type { DateSignal, TrainEvent } from './types.ts';

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
  signals: DateSignal[],
): Notification | null {
  const opens = events.filter((event) => event.kind === 'OPEN');
  const closes = events.filter((event) => event.kind === 'CLOSE');
  const reopened = signals.filter((signal) => signal.kind === 'REOPENED');
  const draining = signals.filter((signal) => signal.kind === 'DRAINING');

  if (opens.length === 0 && closes.length === 0 && signals.length === 0) return null;

  /*
   * Les signaux passent devant les evenements de train, et non l'inverse.
   *
   * Un signal porte sur une journee entiere — « le 30/09 vers Paris, il ne
   * reste que deux trains » — la ou un evenement porte sur un train precis
   * qu'on avait explicitement mis en suivi. Le premier decide d'un voyage, le
   * second confirme une attente.
   */
  const lines = [
    ...signals.map(signalLine),
    ...group(opens),
    ...group(closes, 'parti '),
  ];

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > shown.length) {
    shown.push(`+${lines.length - shown.length} autres`);
  }

  const focus = signals[0] ?? opens[0] ?? closes[0];
  const url = focus
    ? `${APP_URL}?date=${focus.date}&dir=${encodeURIComponent(focus.dir)}`
    : APP_URL;

  return truncate({
    title: buildTitle(reopened, draining, opens.length, closes.length),
    body: shown.join('\n'),
    url,
    tag: 'tgvmax',
  });
}

/**
 * Une ligne de signal porte l'avant et l'apres.
 *
 * « 7 places parties » ne dit pas s'il en reste vingt ou deux, et c'est la
 * seule chose qui decide s'il faut ouvrir l'application maintenant.
 */
function signalLine(signal: DateSignal): string {
  const verb = signal.kind === 'REOPENED' ? 'rouvre' : 'se vide';
  // Pas de fleche pour la transition : `dirLabel` en porte deja une, et deux
  // fleches sur la meme ligne se lisent comme une seule suite de gares.
  return `${verb} ${shortDate(signal.date)} ${dirLabel(signal.dir)} : ${signal.after} place${
    signal.after > 1 ? 's' : ''
  }, ${signal.before} hier`;
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

/**
 * Le titre nomme l'evenement le plus fort, jamais un total.
 *
 * « Nouvelle date a J+30 : 0 train » a existe ici, et masquait derriere ce zero
 * toutes les ouvertures reelles du meme run. Un titre qui agrege perd ce qui
 * fait decider ; un titre qui designe une date et un sens le garde.
 */
function buildTitle(
  reopened: DateSignal[],
  draining: DateSignal[],
  opens: number,
  closes: number,
): string {
  const only = reopened[0];
  if (only && reopened.length === 1) {
    return `${shortDate(only.date)} ${dirLabel(only.dir)} rouvre : ${only.after} trains`;
  }
  if (reopened.length > 1) return `${reopened.length} dates rouvrent`;

  const tight = draining[0];
  if (tight && draining.length === 1) {
    return `${shortDate(tight.date)} ${dirLabel(tight.dir)} : plus que ${tight.after} train${
      tight.after > 1 ? 's' : ''
    }`;
  }
  if (draining.length > 1) return `${draining.length} creneaux se vident`;

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
