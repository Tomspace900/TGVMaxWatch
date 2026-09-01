import { SITE_URL, STATION_LABELS } from './config.ts';
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

  if (opens.length === 0 && closes.length === 0 && newDates.length === 0) return null;

  const title = buildTitle(opens.length, closes.length, newDates);
  const lines: string[] = [];

  for (const entry of newDates) {
    lines.push(
      `J+30 ${shortDate(entry.date)} ${dirLabel(entry.dir)} : ${entry.oui} train${
        entry.oui > 1 ? 's' : ''
      }`,
    );
  }

  for (const event of opens) {
    lines.push(
      `${shortDate(event.date)} ${event.depart} n${event.trainNo} ${formatDuration(
        event.durationMin,
      )}${event.tier === 'long' ? ' (long)' : ''}`,
    );
  }

  for (const event of closes) {
    lines.push(`parti : ${shortDate(event.date)} ${event.depart} n${event.trainNo}`);
  }

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > shown.length) {
    shown.push(`+${lines.length - shown.length} autres`);
  }

  const focus = newDates[0] ?? opens[0] ?? closes[0];
  const url = focus
    ? `${SITE_URL}?date=${focus.date}&dir=${encodeURIComponent(focus.dir)}`
    : SITE_URL;

  return truncate({ title, body: shown.join('\n'), url, tag: 'tgvmax' });
}

function buildTitle(opens: number, closes: number, newDates: NewDate[]): string {
  if (newDates.length > 0) {
    const total = newDates.reduce((sum, entry) => sum + entry.oui, 0);
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
