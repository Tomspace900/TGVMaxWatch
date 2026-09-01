/**
 * Genere une archive synthetique plausible.
 *
 * Sert a developper la PWA et a verifier la chaine de derivation avant que la
 * vraie collecte ait accumule le moindre historique. Ecrit dans `TGVMAX_ROOT`,
 * jamais dans `data/`.
 *
 *   TGVMAX_ROOT=.fixture node scripts/seed-fixture.ts
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_BORDEAUX_PARIS, DIR_PARIS_BORDEAUX, HORIZON_DAYS } from '../src/config.ts';
import { addDays, daysBetween, todayInParis, weekday } from '../src/dates.ts';
import { createHistoryBuilder } from '../src/history.ts';
import { createStatsBuilder } from '../src/stats.ts';
import {
  ROOT,
  listSnapshotDates,
  readSnapshot,
  writeHistory,
  writeJson,
  writeRecords,
  writeSnapshot,
} from '../src/storage.ts';
import type { Snapshot, State, TrainRecord } from '../src/types.ts';

/** Nombre de jours de collecte simules : au-dela du seuil de publication des stats. */
const COLLECTION_DAYS = 70;

/** Generateur deterministe : deux executions produisent la meme archive. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Plan de transport : heure de depart et duree, par sens. */
const TIMETABLE: { depart: string; minutes: number }[] = [
  { depart: '06:06', minutes: 176 },
  { depart: '06:52', minutes: 125 },
  { depart: '07:44', minutes: 128 },
  { depart: '08:40', minutes: 134 },
  { depart: '09:44', minutes: 205 },
  { depart: '10:40', minutes: 126 },
  { depart: '11:44', minutes: 132 },
  { depart: '12:40', minutes: 128 },
  { depart: '13:44', minutes: 198 },
  { depart: '14:40', minutes: 125 },
  { depart: '15:44', minutes: 131 },
  { depart: '16:12', minutes: 134 },
  { depart: '17:40', minutes: 127 },
  { depart: '18:12', minutes: 212 },
  { depart: '18:52', minutes: 125 },
  { depart: '19:44', minutes: 130 },
  { depart: '20:40', minutes: 129 },
  { depart: '21:12', minutes: 141 },
];

function addMinutes(depart: string, minutes: number): string {
  const [h = 0, m = 0] = depart.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Probabilite qu'un train soit encore eligible.
 *
 * Reproduit la dynamique reelle : abondant a J+30, rare a J-2, et nettement
 * plus tendu les vendredis soir et les dimanches.
 */
function availability(daysBefore: number, travelDate: string, depart: string): number {
  const base = Math.min(0.85, 0.12 + (daysBefore / HORIZON_DAYS) * 0.8);
  const day = weekday(travelDate);
  const hour = Number(depart.slice(0, 2));

  let pressure = 1;
  if (day === 5 && hour >= 16) pressure = 0.45; // vendredi soir
  if (day === 0 && hour >= 15) pressure = 0.5; // retour du dimanche
  if (day === 2 || day === 3) pressure = 1.25; // creux de milieu de semaine

  return Math.min(0.95, base * pressure);
}

function buildSnapshot(collectionDate: string, random: () => number): Snapshot {
  const records: TrainRecord[] = [];

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const travelDate = addDays(collectionDate, offset);
    const daysBefore = daysBetween(collectionDate, travelDate);

    for (const dir of [DIR_PARIS_BORDEAUX, DIR_BORDEAUX_PARIS]) {
      const [origine = '', destination = ''] = dir.split('>');

      TIMETABLE.forEach((service, index) => {
        // Quelques trains n'existent pas tous les jours.
        if (random() < 0.06) return;

        const shift = dir === DIR_PARIS_BORDEAUX ? 0 : 30;
        const depart = addMinutes(service.depart, shift);
        const free = random() < availability(daysBefore, travelDate, depart);

        records.push({
          date: travelDate,
          train_no: String((dir === DIR_PARIS_BORDEAUX ? 8400 : 8500) + index * 2),
          origine_iata: origine,
          destination_iata: destination,
          heure_depart: depart,
          heure_arrivee: addMinutes(depart, service.minutes),
          od_happy_card: free ? 'OUI' : 'NON',
        });
      });
    }
  }

  return records;
}

function main(): void {
  if (!process.env['TGVMAX_ROOT']) {
    console.error('Refus d ecrire dans data/. Utilise TGVMAX_ROOT=.fixture');
    process.exit(1);
  }

  rmSync(join(ROOT, 'data'), { recursive: true, force: true });
  mkdirSync(join(ROOT, 'data', 'snapshots'), { recursive: true });

  const today = todayInParis();
  const random = makeRandom(20260901);
  let last: Snapshot = [];

  for (let i = COLLECTION_DAYS - 1; i >= 0; i--) {
    const collectionDate = addDays(today, -i);
    last = buildSnapshot(collectionDate, random);
    writeSnapshot(collectionDate, last);
  }

  writeRecords('data/latest.json', last);

  const dates = listSnapshotDates();
  const history = createHistoryBuilder();
  const stats = createStatsBuilder(today);
  for (const date of dates) {
    const snapshot = readSnapshot(date);
    history.add(date, snapshot);
    stats.add(date, snapshot);
  }

  writeHistory(history.finish(today));
  writeJson('data/stats.json', stats.finish(today, dates.length));

  const state: State = {
    dataProcessed: `${today}T04:22:11+00:00`,
    collectedAt: new Date().toISOString(),
    lastPushOk: null,
    latestSnapshot: today,
    snapshotCount: dates.length,
    recordCount: last.length,
  };
  writeJson('data/state.json', state);

  console.log(`${dates.length} snapshots synthetiques dans ${ROOT}, ${last.length} lignes au dernier.`);
}

main();
