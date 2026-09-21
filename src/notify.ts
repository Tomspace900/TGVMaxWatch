import { APP_URL, STATION_LABELS } from './config.ts';
import { formatDuration } from './duration.ts';
import { openTrainsLabel, trainsWord, weekdayShort } from './label.ts';
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
 *
 * Chaque ligne porte aussi sa propre version **en titre**, et la date qu'elle
 * designe. C'est ce qui permet au titre d'etre la premiere ligne du message
 * plutot qu'un resume fabrique a cote : mesure sur les vingt diffs de
 * l'archive, 25 mouvements de creneau suivi dans les quatorze jours etaient
 * tous dans le corps, **2 seulement** dans le titre — et sur un ecran
 * verrouille, le titre est tout ce qu'on lit. Un message intitule « 7 trains
 * ouverts » portait, trois lignes plus bas, le jeudi matin qui venait de
 * passer de 1 a 7 trains a trois jours du depart.
 */
interface Line {
  dir: string;
  text: string;
  /** Le meme fait, ecrit pour tenir seul en tete de notification. */
  title: string;
  /** La date de voyage designee : c'est elle qu'ouvre le tap. */
  date: string;
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

  if (opens.length === 0 && closes.length === 0 && signals.length === 0 && slots.length === 0) {
    return null;
  }

  /*
   * L'ordre est celui de ce qui a ete demande, et le titre le suit.
   *
   * Les creneaux suivis d'abord, puis les trains suivis, puis les alertes
   * generales — qui portent sur des journees que personne n'a demandees. Les
   * trains suivis passaient jusqu'ici **apres** les generales : ils ne
   * prenaient donc jamais le titre, et le titre annoncait une date a trois
   * semaines pendant que la ligne utile etait quatre lignes plus bas.
   *
   * Une alerte generale ne peut plus prendre le titre des qu'une ligne suivie
   * existe. Elle le prend encore quand elle est seule — un message doit dire de
   * quoi il parle, et « 2 dates rouvrent » ne le disait pas.
   */
  const slotLines = slots.map(slotLine);
  const trainLines = [
    ...group(opens, MARK.up),
    // Plus de « parti » en tete : la marque le dit deja, et le mot le redisait
    // une seconde fois sur une ligne qui n'en a pas la place.
    ...group(closes, MARK.gone),
  ];
  const signalLines = signals.map(signalLine);

  /*
   * Ce qui a ete explicitement suivi ne se fait jamais couper par ce qui ne
   * l'a pas ete.
   *
   * Six dates que personne ne suit suffisaient a evincer le seul train qu'on
   * attendait, et le « +N autres » ne disait pas lesquelles etaient parties.
   * Mesure sur l'archive : le 03/09, deux lignes coupees, **les deux suivies**,
   * pendant que quatre signaux generaux occupaient la place. Le budget se prend
   * donc sur les generaux.
   */
  const followed = slotLines.length + trainLines.length;
  const keptSignals = signalLines.slice(0, Math.max(0, MAX_LINES - followed));

  const lines = [...slotLines, ...trainLines, ...keptSignals];
  const shown = lines.slice(0, MAX_LINES);
  const body = withDirections(shown);

  const hidden = lines.length - shown.length + (signalLines.length - keptSignals.length);
  if (hidden > 0) body.push(`+${hidden} autres`);

  /*
   * Le titre **est** la premiere ligne, pas un resume fabrique a cote.
   *
   * Il annoncait un total — « 7 trains ouverts » — chaque fois que le message
   * ne portait que des evenements de train : sur un ecran verrouille, c'est
   * indiscernable du bruit, alors que la ligne en dessous disait « jeudi matin,
   * 1 → 7 trains ». Deux facons de nommer le meme fait finissent toujours par
   * en nommer deux differents ; ici la seconde etait vide.
   *
   * Et le tap ouvre exactement ce que le titre annonce.
   */
  const head = shown[0]!;
  const url = `${APP_URL}?date=${head.date}&dir=${encodeURIComponent(head.dir)}`;

  return truncate({ title: head.title, body: body.join('\n'), url, tag: 'tgvmax' });
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
 *
 * Quatre verbes pour quatre etats, et trois marques pour un seul axe : un
 * creneau qui se ferme n'est pas un creneau qui se vide, il n'y a plus rien a
 * en attendre. C'est donc la marque d'un train parti qu'il porte.
 */
const SLOT_VERBS: Record<SlotSignal['kind'], { word: string; mark: string }> = {
  SLOT_OPENED: { word: 'ouvre', mark: MARK.up },
  SLOT_FILLING: { word: 'se remplit', mark: MARK.up },
  SLOT_DRAINING: { word: 'se vide', mark: MARK.down },
  SLOT_CLOSED: { word: 'se ferme', mark: MARK.gone },
};

function slotLine(signal: SlotSignal): Line {
  const { word, mark } = SLOT_VERBS[signal.kind];
  const move = `${signal.before_count} → ${signal.after_count} ${trainsWord(signal.after_count)}`;

  return {
    dir: signal.dir,
    date: signal.date,
    text: `${mark} ${word} ${dateLabel(signal.date)} ${signal.label} : ${move}`,
    title: `${dateLabel(signal.date)} ${dirLabel(signal.dir)} ${signal.label} : ${move}`,
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
  const word = reopened ? 'rouvre' : 'se vide';
  const move = `${signal.before} → ${signal.after} ${trainsWord(signal.after)}`;

  return {
    dir: signal.dir,
    date: signal.date,
    text: `${reopened ? MARK.up : MARK.down} ${word} ${dateLabel(signal.date)} : ${move}`,
    title: `${dateLabel(signal.date)} ${dirLabel(signal.dir)} ${word} : ${move}`,
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
 *
 * Le titre d'un groupe compte, celui d'un train seul donne l'heure. C'est la
 * regle du projet appliquee au titre : la maille du message suit la maille du
 * suivi, et un suivi pose sur une minute designe ce depart-la.
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
    const open = first.kind === 'OPEN';

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

    const title =
      bucket.length === 1
        ? `${dateLabel(first.date)} ${first.depart} ${dirLabel(first.dir)} : ${
            open ? 'ouvert' : 'parti'
          }`
        : `${dateLabel(first.date)} ${dirLabel(first.dir)} : ${
            open ? openTrainsLabel(bucket.length) : `${bucket.length} trains partis`
          }`;

    return {
      dir: first.dir,
      date: first.date,
      text: `${mark} ${dateLabel(first.date)} ${times.join(' ')}${rest > 0 ? ` +${rest}` : ''}`,
      title,
    };
  });
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
