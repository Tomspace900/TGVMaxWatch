/**
 * Copie les donnees dans le site avant le build.
 *
 * Les JSON deviennent ainsi des fichiers statiques same-origin servis par le
 * CDN : le service worker les met en cache sans configuration particuliere, et
 * la PWA n'a besoin d'aucun jeton pour lire.
 *
 *   node scripts/sync-data.ts [--from .fixture]
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const TARGET = join(REPO, 'web', 'public', 'data');

/** `push-subscription.json` n'est deliberement pas publie : le site n'en a pas l'usage. */
const FILES = [
  'data/state.json',
  'data/latest.json',
  'data/history.json',
  'data/stats.json',
  'watchlist.json',
  'reservations.json',
];

function main(): void {
  const index = process.argv.indexOf('--from');
  const source = index === -1 ? REPO : resolve(process.argv[index + 1] ?? REPO);

  mkdirSync(TARGET, { recursive: true });

  for (const file of FILES) {
    // Une archive synthetique ne contient pas la watchlist ni les
    // reservations : ce sont des fichiers de configuration reels, on retombe
    // donc sur ceux du repo.
    const from = [join(source, file), join(REPO, file)].find((candidate) =>
      existsSync(candidate),
    );

    if (!from) {
      console.warn(`[sync] ${file} absent, ignore`);
      continue;
    }
    copyFileSync(from, join(TARGET, file.split('/').at(-1)!));
  }

  console.log(`[sync] donnees copiees depuis ${source}`);
}

main();
