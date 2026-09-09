import { APP_URL, STATION_LABELS } from './config.ts';
import { formatDuration } from './duration.ts';
import { trainsWord, weekdayShort } from './label.ts';
import { isCoveredBySlot } from './slots.ts';
import type { DateSignal, SlotSignal, TrainEvent } from './types.ts';

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
  return `${STATION_LABELS[from] ?? from} → ${STATION_LABELS[to] ?? to}`;
}

/**
 * `2026-09-14` -> `lun 14/09`.
 *
 * Le jour de la semaine et non la seule date : « le 14 » ne decide rien, et il
 * fallait ouvrir un calendrier pour savoir de quel jour on parlait — sur le
 * seul message dont tout l'interet est d'etre lu d'un oeil.
 */
export function dateLabel(iso: string): string {
  const [, month = '', day = ''] = iso.split('-');
  return `${weekdayShort(iso)} ${day}/${month}`;
}

/**
 * Une marque par nature d'evenement, en tete de ligne.
 *
 * Trois marques, un seul axe : la disponibilite monte, baisse, ou est finie.
 * C'est la question qu'on se pose en un dixieme de seconde devant l'ecran
 * verrouille ; la granularite — un train, un creneau, une journee — se lit
 * ensuite, dans les mots.
 *
 * Le mot reste, la marque ne fait que l'accelerer : c'est la meme regle que
 * l'ambre de l'interface, et c'est ce qui la rend sure. Vert et orange se
 * ressemblent en deuteranopie, « ouvre » et « se vide » non.
 *
 * En tete de ligne et jamais dans le titre : alignees les unes sous les autres
 * elles forment une colonne qui se balaie, tandis qu'un signal pose partout
 * redevient un fond.
 */
const MARK = {
  /** Il y a plus de trains qu'hier. */
  up: '🟢',
  /** Il en reste moins, et peu. */
  down: '🟠',
  /** Ceux-la sont partis, il n'y a plus rien a en attendre. */
  gone: '⚫',
} as const;

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
  slots: SlotSignal[] = [],
): Notification | null {
  /*
   * Un creneau qui s'ouvre absorbe les trains qui l'ont ouvert.
   *
   * Sans ce filtre, « le matin du 18 s'ouvre » serait suivi des trois horaires
   * qui viennent de s'ouvrir dedans : quatre lignes pour un evenement. La
   * maille du message suit la maille du suivi.
   */
  const loose = events.filter((event) => !isCoveredBySlot(slots, event));
  const opens = loose.filter((event) => event.kind === 'OPEN');
  const closes = loose.filter((event) => event.kind === 'CLOSE');
  const reopened = signals.filter((signal) => signal.kind === 'REOPENED');
  const draining = signals.filter((signal) => signal.kind === 'DRAINING');

  if (opens.length === 0 && closes.length === 0 && signals.length === 0 && slots.length === 0) {
    return null;
  }

  /*
   * Les signaux passent devant les evenements de train, et non l'inverse.
   *
   * Un signal porte sur une journee entiere — « le 30/09 vers Paris, il ne
   * reste que deux trains » — la ou un evenement porte sur un train precis
   * qu'on avait explicitement mis en suivi. Le premier decide d'un voyage, le
   * second confirme une attente.
   */
  /*
   * Les creneaux suivis passent devant tout le reste.
   *
   * Une alerte generale porte sur une journee que personne n'a demandee ; un
   * signal de creneau porte sur une fenetre qu'on a explicitement mise en
   * suivi. Le second est toujours plus pertinent que le premier pour celui qui
   * lit le message.
   */
  const lines = [
    ...slots.map(slotLine),
    ...signals.map(signalLine),
    ...group(opens, MARK.up),
    // Plus de « parti » en tete : le titre le dit deja, et la marque le
    // redisait une troisieme fois. Elle prend sa place au lieu de s'y ajouter.
    ...group(closes, MARK.gone),
  ];

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > shown.length) {
    shown.push(`+${lines.length - shown.length} autres`);
  }

  const focus = slots[0] ?? signals[0] ?? opens[0] ?? closes[0];
  const url = focus
    ? `${APP_URL}?date=${focus.date}&dir=${encodeURIComponent(focus.dir)}`
    : APP_URL;

  return truncate({
    title: buildTitle(slots, reopened, draining, opens.length, closes.length),
    body: shown.join('\n'),
    url,
    tag: 'tgvmax',
  });
}

/**
 * Une ligne de creneau suivi.
 *
 * Elle porte le nom de la fenetre — « matin » plutot que « 05:00-12:00 » — parce
 * que c'est le mot avec lequel le suivi a ete pose. Et l'avant/apres, pour la
 * meme raison que partout ailleurs : « 2 trains » ne dit pas s'il en restait
 * cinq hier ou deux.
 */
function slotLine(signal: SlotSignal): string {
  const opened = signal.kind === 'SLOT_OPENED';
  return `${opened ? MARK.up : MARK.down} ${opened ? 'ouvre' : 'se vide'} ${dateLabel(
    signal.date,
  )} ${dirLabel(signal.dir)} ${signal.label} : ${signal.after_count} ${trainsWord(
    signal.after_count,
  )}, ${signal.before_count} hier`;
}

/**
 * Une ligne de signal porte l'avant et l'apres.
 *
 * « 7 trains partis » ne dit pas s'il en reste vingt ou deux, et c'est la
 * seule chose qui decide s'il faut ouvrir l'application maintenant.
 *
 * Le compte porte des trains, jamais des sieges : voir `trainsWord`.
 */
function signalLine(signal: DateSignal): string {
  const reopened = signal.kind === 'REOPENED';
  // Pas de fleche pour la transition : `dirLabel` en porte deja une, et deux
  // fleches sur la meme ligne se lisent comme une seule suite de gares.
  return `${reopened ? MARK.up : MARK.down} ${reopened ? 'rouvre' : 'se vide'} ${dateLabel(
    signal.date,
  )} ${dirLabel(signal.dir)} : ${signal.after} ${trainsWord(signal.after)}, ${signal.before} hier`;
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
function group(events: TrainEvent[], mark: string): string[] {
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

    return `${mark} ${dateLabel(first.date)} ${dirLabel(first.dir)} ${times.join(' ')}${
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
  slots: SlotSignal[],
  reopened: DateSignal[],
  draining: DateSignal[],
  opens: number,
  closes: number,
): string {
  /*
   * Un creneau suivi prend le titre, toujours.
   *
   * C'est la seule ligne du message dont on sait qu'elle a ete demandee. Lui
   * preferer une alerte generale reviendrait a annoncer la meteo a quelqu'un
   * qui attend un coup de fil.
   */
  const slot = slots[0];
  if (slot && slots.length === 1) {
    return slot.kind === 'SLOT_OPENED'
      ? `${dateLabel(slot.date)} ${dirLabel(slot.dir)} ${slot.label} : ${slot.after_count} ${trainsWord(
          slot.after_count,
        )}`
      : `${dateLabel(slot.date)} ${dirLabel(slot.dir)} ${slot.label} : plus que ${
          slot.after_count
        } ${trainsWord(slot.after_count)}`;
  }
  if (slots.length > 1) return `${slots.length} creneaux suivis bougent`;

  const only = reopened[0];
  if (only && reopened.length === 1) {
    return `${dateLabel(only.date)} ${dirLabel(only.dir)} rouvre : ${only.after} trains`;
  }
  if (reopened.length > 1) return `${reopened.length} dates rouvrent`;

  const tight = draining[0];
  if (tight && draining.length === 1) {
    return `${dateLabel(tight.date)} ${dirLabel(tight.dir)} : plus que ${tight.after} train${
      tight.after > 1 ? 's' : ''
    }`;
  }
  if (draining.length > 1) return `${draining.length} creneaux se vident`;

  if (opens > 0) {
    return `${opens} ${trainsWord(opens)} ouvert${opens > 1 ? 's' : ''}`;
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
