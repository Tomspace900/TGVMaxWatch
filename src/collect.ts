import { todayInParis } from './dates.ts';
import { rebuildDerived } from './derive.ts';
import { fetchDatasetInfo, fetchSnapshot, selectFor } from './sncf.ts';
import { listSnapshotDates, readState, writeRecords, writeSnapshot, writeState } from './storage.ts';

/**
 * Collecteur : archive le releve du jour et refait les vues derivees.
 *
 * Il ne compose plus aucun message. Le telephone est le seul a connaitre ce
 * qu'on suit : `collect.yml` le reveille une fois le commit pousse, et c'est
 * lui qui compare et decide. L'invariant du projet en sort renforce — la
 * donnee est dans le depot avant que quiconque soit prevenu.
 *
 * Idempotent sur `data_processed` : le Worker Cloudflare peut le lancer sans
 * se soucier d'un doublon.
 */
async function main(): Promise<void> {
  const today = todayInParis();
  const state = readState();

  const { dataProcessed, fields } = await fetchDatasetInfo();
  if (dataProcessed === state.dataProcessed) {
    console.log(`[collect] donnee inchangee (${dataProcessed}), rien a faire`);
    return;
  }

  console.log(`[collect] nouvelle publication ${dataProcessed}, collecte en cours`);
  const snapshot = await fetchSnapshot(selectFor(fields));
  console.log(`[collect] ${snapshot.length} lignes recuperees`);

  writeSnapshot(today, snapshot);
  writeRecords('data/latest.json', snapshot);
  rebuildDerived(today);

  writeState({
    ...state,
    dataProcessed,
    collectedAt: new Date().toISOString(),
    latestSnapshot: today,
    snapshotCount: listSnapshotDates().length,
    recordCount: snapshot.length,
  });
  console.log('[collect] donnees ecrites');
}

await main();
