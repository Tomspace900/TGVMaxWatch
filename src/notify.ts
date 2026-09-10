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

/**
 * Une ligne de detail, et le sens auquel elle appartient.
 *
 * Le sens voyage a cote du texte au lieu d'etre dedans : « Paris → Bordeaux »
 * occupait dix-huit caracteres sur les trente-six que tient une ligne de
 * notification, donc chaque ligne se repliait — et une ligne repliee perd sa
 * pastille, part du bord gauche, et se lit comme un nouvel element. La colonne
 * de marques, qui est tout l'interet du balayage, s'effondrait.
 */
interface Line {
  dir: string;
  text: string;
}

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
  const slotLines = slots.map(slotLine);
  const signalLines = signals.map(signalLine);
  const trainLines = [
    ...group(opens, MARK.up),
    // Plus de « parti » en tete : le titre le dit deja, et la marque le
    // redisait une troisieme fois. Elle prend sa place au lieu de s'y ajouter.
    ...group(closes, MARK.gone),
  ];

  /*
   * Ce qui a ete explicitement suivi ne se fait jamais couper par ce qui ne
   * l'a pas ete.
   *
   * Les creneaux suivis etaient bien en tete, mais les evenements de train —
   * qui ne survivent a `filterEvents` que parce qu'on a demande a suivre cette
   * fenetre — passaient **apres** les signaux generaux. Six dates que personne
   * ne suit suffisaient donc a evincer le seul train qu'on attendait, et le
   * « +N autres » ne disait pas lesquelles etaient parties. Mesure sur
   * l'archive : le 03/09, deux lignes coupees, **les deux suivies**, pendant
   * que quatre signaux generaux occupaient la place.
   *
   * Le budget se prend donc sur les generaux. L'ordre d'affichage, lui, ne
   * bouge pas : ce qui decide reste en haut.
   */
  const followed = slotLines.length + trainLines.length;
  const keptSignals = signalLines.slice(0, Math.max(0, MAX_LINES - followed));

  const lines = [...slotLines, ...keptSignals, ...trainLines];
  const shown = lines.slice(0, MAX_LINES);
  const body = withDirections(shown);

  const hidden = lines.length - shown.length + (signalLines.length - keptSignals.length);
  if (hidden > 0) body.push(`+${hidden} autres`);

  // Le tap ouvre une ligne qui est dans le message, jamais une qui vient d'en
  // etre ecartee.
  const focus = slots[0] ?? (keptSignals.length > 0 ? signals[0] : undefined) ?? opens[0] ?? closes[0];
  const url = focus
    ? `${APP_URL}?date=${focus.date}&dir=${encodeURIComponent(focus.dir)}`
    : APP_URL;

  return truncate({
    title: buildTitle(slots, reopened, draining, opens.length, closes.length),
    body: body.join('\n'),
    url,
    tag: 'tgvmax',
  });
}

/**
 * Le sens en sous-titre, ecrit une fois, et seulement quand il change.
 *
 * Regrouper les lignes par sens aurait casse l'ordre de priorite — un creneau
 * suivi passe avant une alerte generale, qui passe avant une ouverture de train
 * — et cet ordre est la seule chose qui garantit que la ligne la plus utile est
 * visible en premier. On garde donc l'ordre, et on n'ecrit le sens que lorsqu'il
 * ne vaut plus. La plupart des messages ne portent qu'un sens : l'en-tete
 * n'apparait alors qu'une fois, en tete.
 *
 * L'en-tete ne porte pas de marque, et c'est ce qui le distingue : au milieu de
 * lignes qui commencent toutes par une pastille, une ligne nue se lit comme un
 * titre sans qu'on ait a la decorer.
 */
function withDirections(lines: Line[]): string[] {
  const body: string[] = [];
  let current: string | null = null;

  for (const line of lines) {
    if (line.dir !== current) {
      body.push(dirLabel(line.dir));
      current = line.dir;
    }
    body.push(line.text);
  }

  return body;
}

/**
 * Une ligne de creneau suivi.
 *
 * Elle porte le nom de la fenetre — « matin » plutot que « 05:00-12:00 » — parce
 * que c'est le mot avec lequel le suivi a ete pose. Et l'avant/apres, pour la
 * meme raison que partout ailleurs : « 2 trains » ne dit pas s'il en restait
 * cinq hier ou deux.
 */
function slotLine(signal: SlotSignal): Line {
  const opened = signal.kind === 'SLOT_OPENED';
  return {
    dir: signal.dir,
    text: `${opened ? MARK.up : MARK.down} ${opened ? 'ouvre' : 'se vide'} ${dateLabel(
      signal.date,
    )} ${signal.label} : ${signal.before_count} → ${signal.after_count} ${trainsWord(
      signal.after_count,
    )}`,
  };
}

/**
 * Une ligne de signal porte l'avant et l'apres.
 *
 * « 7 trains partis » ne dit pas s'il en reste vingt ou deux, et c'est la
 * seule chose qui decide s'il faut ouvrir l'application maintenant.
 *
 * L'avant et l'apres s'ecrivent desormais en transition — `0 → 10 trains` — et
 * non plus en « 10 trains, 0 hier ». C'est quatre caracteres de moins, sur des
 * lignes qui debordaient d'un ou deux, et ca se lit dans le sens du temps. La
 * fleche etait jusqu'ici interdite ici parce que `dirLabel` en portait deja une
 * sur la meme ligne, et que deux fleches se lisaient comme une seule suite de
 * gares : le sens ayant demenage dans l'en-tete, l'objection est tombee avec.
 *
 * Le compte porte des trains, jamais des sieges : voir `trainsWord`.
 */
function signalLine(signal: DateSignal): Line {
  const reopened = signal.kind === 'REOPENED';
  return {
    dir: signal.dir,
    text: `${reopened ? MARK.up : MARK.down} ${reopened ? 'rouvre' : 'se vide'} ${dateLabel(
      signal.date,
    )} : ${signal.before} → ${signal.after} ${trainsWord(signal.after)}`,
  };
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
function group(events: TrainEvent[], mark: string): Line[] {
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
     * Plus de doublon d'horaire a ecarter ici : deux rames a la meme minute
     * — le 06/09, les 8473 et 8505 partent a 10:41 — sont repliees en un seul
     * depart par `foldDepartures`, et un evenement porte une cle de depart.
     * La deduplication qui vivait a cet endroit est devenue impossible a
     * declencher.
     */
    const times = bucket
      .slice(0, MAX_TIMES)
      .map(
        (event) =>
          `${event.depart}${
            event.tier === 'long' ? ` (${formatDuration(event.durationMin)})` : ''
          }`,
      );
    const rest = bucket.length - times.length;

    return {
      dir: first.dir,
      text: `${mark} ${dateLabel(first.date)} ${times.join(' ')}${rest > 0 ? ` +${rest}` : ''}`,
    };
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
  if (slots.length > 1) return `${slots.length} créneaux suivis bougent`;

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
  // Des dates entieres, pas des creneaux : « creneau » designe une fenetre
  // suivie, et le titre voisin dit deja « 2 dates rouvrent » des memes objets.
  // L'application parlait deux langues sur le meme objet.
  if (draining.length > 1) return `${draining.length} dates se vident`;

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
