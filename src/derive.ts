import { foldDepartures } from './departures.ts';
import { isTracked } from './duration.ts';
import { createHistoryBuilder } from './history.ts';
import { createStatsBuilder } from './stats.ts';
import { createTrainsBuilder } from './trains.ts';
import { listSnapshotDates, readSnapshot, writeHistory, writeJson, writeTrains } from './storage.ts';

/**
 * Recalcule les agregats depuis l'ensemble de l'archive, en une seule passe.
 *
 * Les snapshots sont la source de verite ; `history.json`, `stats.json` et
 * `trains.json` n'en sont que des vues. Un bug d'agregation se repare donc en
 * relancant ce calcul, sans jamais toucher a l'archive.
 *
 * Il vit dans son propre module, et non plus dans `collect.ts`, pour que ce
 * soit vrai : `collect.ts` exécute sa collecte a l'import, et la seule facon de
 * refaire les vues etait donc d'attendre une nouvelle publication de la source.
 * Un changement de regle d'agregation laissait entre-temps des fichiers derives
 * incoherents avec le code qui les lit — l'application cherchant une cle que
 * l'ancien fichier ne porte pas, et n'affichant simplement rien.
 * `npm run rebuild` fait le travail tout de suite.
 */
export function rebuildDerived(today: string): void {
  const dates = listSnapshotDates();
  const history = createHistoryBuilder();
  const stats = createStatsBuilder(today);
  const trains = createTrainsBuilder(today);

  for (const collectionDate of dates) {
    // Les snapshots anterieurs au filtrage contiennent encore des gares hors
    // perimetre : les ecarter ici evite qu'ils ne remontent dans les agregats.
    // Le repli en departs se fait ici, une fois par snapshot : toutes les vues
    // derivees comptent la meme chose, et l'archive garde ce que la source a
    // publie.
    const departures = foldDepartures(readSnapshot(collectionDate).filter(isTracked));
    history.add(collectionDate, departures);
    stats.add(collectionDate, departures);
    trains.add(collectionDate, departures);
  }

  writeHistory(history.finish(today));
  writeJson('data/stats.json', stats.finish(today, dates.length));
  writeTrains(trains.finish());
  console.log(`[derive] agregats reconstruits sur ${dates.length} snapshots`);
}
