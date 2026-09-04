import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { History, Snapshot, State, Stats, TrainRecord, Watchlist } from './types.ts';

/**
 * Racine des donnees.
 *
 * `TGVMAX_ROOT` permet de faire tourner la vraie chaine de derivation sur un
 * jeu de donnees synthetique, sans jamais toucher a l'archive reelle.
 */
export const ROOT = process.env['TGVMAX_ROOT']
  ? resolve(process.env['TGVMAX_ROOT'])
  : join(import.meta.dirname, '..');
export const DATA_DIR = join(ROOT, 'data');
export const SNAPSHOTS_DIR = join(DATA_DIR, 'snapshots');

export const EMPTY_STATE: State = {
  dataProcessed: null,
  collectedAt: null,
  lastPushOk: null,
  latestSnapshot: null,
  snapshotCount: 0,
  recordCount: 0,
};

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

export function readJson<T>(relativePath: string, fallback: T): T {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function writeJson(relativePath: string, value: unknown): void {
  const file = join(ROOT, relativePath);
  ensureDir(file);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Serialise un snapshot avec un enregistrement par ligne.
 *
 * `JSON.stringify(value, null, 2)` produirait 450 ko illisibles en diff git ;
 * le format compact sur une seule ligne serait pire encore. Une ligne par
 * train donne un diff ou l'on voit exactement quels trains ont bouge.
 */
export function stringifyRecords(records: readonly TrainRecord[]): string {
  if (records.length === 0) return '[]\n';
  const lines = records.map((record) => JSON.stringify(record));
  return `[\n${lines.join(',\n')}\n]\n`;
}

export function writeRecords(relativePath: string, records: readonly TrainRecord[]): void {
  const file = join(ROOT, relativePath);
  ensureDir(file);
  writeFileSync(file, stringifyRecords(records));
}

/** Snapshot archive, gzippe : ~12,6 ko contre ~300 ko brut. */
export function writeSnapshot(collectionDate: string, records: readonly TrainRecord[]): void {
  const file = join(SNAPSHOTS_DIR, `${collectionDate}.json.gz`);
  ensureDir(file);
  writeFileSync(file, gzipSync(stringifyRecords(records), { level: 9 }));
}

export function readSnapshot(collectionDate: string): Snapshot {
  const file = join(SNAPSHOTS_DIR, `${collectionDate}.json.gz`);
  return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as Snapshot;
}

/** Dates de collecte disponibles, du plus ancien au plus recent. */
export function listSnapshotDates(): string[] {
  if (!existsSync(SNAPSHOTS_DIR)) return [];
  return readdirSync(SNAPSHOTS_DIR)
    .filter((name) => name.endsWith('.json.gz'))
    .map((name) => name.slice(0, -'.json.gz'.length))
    .sort();
}

export const readState = (): State => readJson<State>('data/state.json', EMPTY_STATE);
export const writeState = (state: State): void => writeJson('data/state.json', state);

export const readHistory = (): History => readJson<History>('data/history.json', {});
export const readStats = (): Stats | null => readJson<Stats | null>('data/stats.json', null);

/**
 * Seul fichier de preference que le collecteur lit encore.
 *
 * Les reservations, elles, ne passent plus par le depot : elles vivent dans le
 * stockage local de l'application. Le collecteur ne peut en revanche pas
 * filtrer sur une watchlist qu'il ne lirait pas — celle-ci reste donc ici.
 */
export const readWatchlist = (): Watchlist =>
  readJson<Watchlist>('watchlist.json', { watch: [], rules: [] });

/**
 * `history.json` avec les series d'observations sur une seule ligne.
 *
 * Le fichier atteint ~150 dates de voyage x 2 sens x 30 observations ; en
 * indentation complete il depasserait 400 ko pour une lisibilite nulle.
 */
export function writeHistory(history: History): void {
  const dates = Object.keys(history).sort();
  const blocks = dates.map((date) => {
    const dirs = Object.keys(history[date] ?? {}).sort();
    const series = dirs.map(
      (dir) =>
        `    ${JSON.stringify(dir)}: [${(history[date]?.[dir] ?? [])
          .map((observation) => JSON.stringify(observation))
          .join(',')}]`,
    );
    return `  ${JSON.stringify(date)}: {\n${series.join(',\n')}\n  }`;
  });

  const file = join(DATA_DIR, 'history.json');
  ensureDir(file);
  writeFileSync(file, blocks.length === 0 ? '{}\n' : `{\n${blocks.join(',\n')}\n}\n`);
}
