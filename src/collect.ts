import { todayInParis } from './dates.ts';
import { diffSnapshots } from './diff.ts';
import { isTracked } from './duration.ts';
import { createHistoryBuilder } from './history.ts';
import { buildNotification } from './notify.ts';
import { sendPush } from './push.ts';
import { fetchDatasetInfo, fetchSnapshot, selectFor } from './sncf.ts';
import { createStatsBuilder } from './stats.ts';
import { createTrainsBuilder } from './trains.ts';
import {
  listSnapshotDates,
  readSnapshot,
  readState,
  readWatchlist,
  writeHistory,
  writeJson,
  writeRecords,
  writeSnapshot,
  writeState,
  writeTrains,
} from './storage.ts';
import { filterEvents } from './watchlist.ts';
import type { Snapshot, State } from './types.ts';

/**
 * Collecteur quotidien.
 *
 * Tourne deux fois par jour parce que le cron GitHub est frequemment retarde
 * et parfois saute ; l'idempotence sur `data_processed` fait que la seconde
 * execution ne coute rien quand la premiere a deja travaille.
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

  // Le snapshot precedent doit etre lu avant d'ecrire le nouveau, sans quoi le
  // diff comparerait le nouveau fichier avec lui-meme.
  const previous = readPreviousSnapshot(today);

  writeSnapshot(today, snapshot);
  writeRecords('data/latest.json', snapshot);

  rebuildDerived(today);

  const nextState: State = {
    ...state,
    dataProcessed,
    collectedAt: new Date().toISOString(),
    latestSnapshot: today,
    snapshotCount: listSnapshotDates().length,
    recordCount: snapshot.length,
  };

  /*
   * L'etat est ecrit avant la notification, et non apres.
   *
   * L'archive est la partie irremplacable : la source ecrase son dataset et un
   * jour non collecte est perdu pour toujours. Une panne du canal d'alerte ne
   * doit donc jamais emporter la collecte avec elle — le workflow echouera
   * quand meme, mais apres avoir mis les donnees a l'abri.
   */
  writeState(nextState);
  console.log('[collect] donnees ecrites');

  if (!previous) {
    console.log('[collect] premier snapshot, aucun diff possible');
    return;
  }

  const pushedAt = await notify(previous, snapshot, today, state.lastPushOk);
  if (pushedAt !== state.lastPushOk) {
    writeState({ ...nextState, lastPushOk: pushedAt });
  }
  console.log('[collect] termine');
}

/**
 * Snapshot de reference pour le diff : le plus recent qui ne soit pas celui
 * qu'on s'apprete a ecrire. Une seconde publication le meme jour ecrase le
 * fichier du jour, donc on l'exclut explicitement.
 *
 * Le filtrage est le meme que pour les agregats, et pour la meme raison : les
 * snapshots ecrits avant la restriction du perimetre contiennent encore des
 * gares hors sujet. Le nouveau snapshot, lui, arrive deja filtre — sans cette
 * symetrie, chacune de ces lignes ressort en train supprime a chaque
 * execution.
 */
function readPreviousSnapshot(today: string): Snapshot | null {
  const previousDate = listSnapshotDates()
    .filter((date) => date !== today)
    .at(-1);
  return previousDate ? readSnapshot(previousDate).filter(isTracked) : null;
}

/**
 * Recalcule les agregats depuis l'ensemble de l'archive, en une seule passe.
 *
 * Les snapshots sont la source de verite ; `history.json` et `stats.json` n'en
 * sont que des vues. Un bug d'agregation se repare donc en relancant le job.
 */
function rebuildDerived(today: string): void {
  const dates = listSnapshotDates();
  const history = createHistoryBuilder();
  const stats = createStatsBuilder(today);
  const trains = createTrainsBuilder(today);

  for (const collectionDate of dates) {
    // Les snapshots anterieurs au filtrage contiennent encore des gares hors
    // perimetre : les ecarter ici evite qu'ils ne remontent dans les agregats.
    const snapshot = readSnapshot(collectionDate).filter(isTracked);
    history.add(collectionDate, snapshot);
    stats.add(collectionDate, snapshot);
    trains.add(collectionDate, snapshot);
  }

  writeHistory(history.finish(today));
  writeJson('data/stats.json', stats.finish(today, dates.length));
  writeTrains(trains.finish());
  console.log(`[collect] agregats reconstruits sur ${dates.length} snapshots`);
}

/**
 * Diff, puis au plus un message pousse.
 *
 * Deux chemins distincts, et c'est le coeur du reglage : les evenements de
 * train passent par la watchlist — ce sont les creneaux qu'on suit — tandis que
 * les signaux de date la contournent entierement. Les faire passer par le meme
 * filtre reduisait au silence, six jours sur sept, la seule alerte qui n'ait
 * besoin d'aucune preference pour etre utile.
 */
async function notify(
  previous: Snapshot,
  current: Snapshot,
  today: string,
  lastPushOk: string | null,
): Promise<string | null> {
  const { events, signals } = diffSnapshots(previous, current, today);
  console.log(`[collect] ${events.length} evenements, ${signals.length} signaux`);

  const watched = filterEvents(readWatchlist(), events);

  const notification = buildNotification(watched, signals);
  if (!notification) {
    console.log('[collect] rien a signaler, aucune notification');
    return lastPushOk;
  }

  const outcome = await sendPush(notification);
  return outcome === 'sent' ? new Date().toISOString() : lastPushOk;
}

await main();
