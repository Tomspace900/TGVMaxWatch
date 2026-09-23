import { APP_URL, STATION_LABELS } from './config.ts';
import { dateLabel, trainsWord, watchLabel } from './label.ts';
import { isTrainWatch } from './watchlist.ts';
import type { DateSignal, WatchSignal } from './types.ts';

/** Ce que le telephone affiche : un titre, un corps, et le jour qu'ouvre le tap. */
export interface Notification {
  title: string;
  body: string;
  url: string;
}

/** Lignes detaillees avant de basculer sur un « +N autres ». */
const MAX_LINES = 6;

/**
 * Une ligne du corps, sa version en titre, et ce qu'elle designe.
 *
 * Le titre **est** la premiere ligne, jamais un resume fabrique a cote, et le
 * corps ne la repete pas :
 * mesure sur l'archive, 25 mouvements de creneau suivi etaient dans le corps et
 * 2 seulement dans le titre, sous un « 7 trains ouverts » indiscernable du
 * bruit. Sur un ecran verrouille, le titre est tout ce qu'on lit.
 */
interface Line {
  dir: string;
  date: string;
  text: string;
  title: string;
}

export function dirLabel(dir: string): string {
  const [from = '', to = ''] = dir.split('>');
  return `${STATION_LABELS[from] ?? from} → ${STATION_LABELS[to] ?? to}`;
}

/**
 * Une marque en tete de ligne, un seul axe : ca monte, ca baisse, c'est fini.
 * Le mot reste toujours a cote — vert et orange se ressemblent en
 * deuteranopie, « ouvre » et « se vide » non.
 */
const MARK = { up: '🟢', down: '🟠', gone: '⚫' } as const;

const WATCH_WORDS: Record<WatchSignal['kind'], { word: string; mark: string }> = {
  OPENED: { word: 'ouvre', mark: MARK.up },
  FILLING: { word: 'se remplit', mark: MARK.up },
  DRAINING: { word: 'se vide', mark: MARK.down },
  CLOSED: { word: 'se ferme', mark: MARK.gone },
};

function watchLine(signal: WatchSignal): Line {
  const { watch } = signal;
  const label = watchLabel(watch);
  const date = watch.from.slice(0, 10);

  // Un train seul n'a pas de compte a lire : il est ouvert, ou il ne l'est plus.
  if (isTrainWatch(watch)) {
    const open = signal.kind === 'OPENED';
    return {
      dir: watch.dir,
      date,
      text: `${open ? MARK.up : MARK.gone} ${open ? 'ouvert' : 'complet'} ${label}`,
      title: `${label} : ${open ? 'ouvert' : 'complet'}`,
    };
  }

  const { word, mark } = WATCH_WORDS[signal.kind];
  const move = `${signal.before} → ${signal.after} ${trainsWord(signal.after)}`;
  return { dir: watch.dir, date, text: `${mark} ${word} ${label} : ${move}`, title: `${label} : ${move}` };
}

function dateLine(signal: DateSignal): Line {
  const reopened = signal.kind === 'REOPENED';
  const word = reopened ? 'rouvre' : 'se vide';
  const move = `${signal.before} → ${signal.after} ${trainsWord(signal.after)}`;
  return {
    dir: signal.dir,
    date: signal.date,
    text: `${reopened ? MARK.up : MARK.down} ${word} ${dateLabel(signal.date)} : ${move}`,
    title: `${dateLabel(signal.date)} ${word} : ${move}`,
  };
}

/**
 * L'unique message d'un releve, ou rien.
 *
 * Ce qui est suivi d'abord, les alertes generales ensuite — et le budget se
 * prend sur elles, jamais sur ce qu'on a demande.
 */
export function buildNotification(
  watched: WatchSignal[],
  general: DateSignal[],
): Notification | null {
  const followed = watched.map(watchLine);
  const others = general.map(dateLine);
  const kept = others.slice(0, Math.max(0, MAX_LINES - followed.length));
  const lines = [...followed, ...kept];
  const shown = lines.slice(0, MAX_LINES);
  const head = shown[0];
  if (!head) return null;

  // Le titre dit deja la premiere ligne : le corps n'en garde que le sens, qui
  // s'affiche juste en dessous meme message replie.
  const body = withDirections(shown);
  body.splice(1, 1);
  const hidden = lines.length - shown.length + (others.length - kept.length);
  if (hidden > 0) body.push(`+${hidden} autres`);

  return {
    title: head.title,
    body: body.join('\n'),
    url: `${APP_URL}?date=${head.date}&dir=${encodeURIComponent(head.dir)}`,
  };
}

/**
 * Le sens en sous-titre, ecrit une fois, et seulement quand il change.
 *
 * « Paris → Bordeaux » sur chaque ligne les faisait toutes se replier. Le titre
 * ne le porte pas non plus : la premiere ligne du corps, visible sous le titre
 * meme message replie, le dit juste en dessous.
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
