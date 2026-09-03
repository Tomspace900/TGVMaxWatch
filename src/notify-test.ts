import { diffSnapshots } from './diff.ts';
import { isTracked } from './duration.ts';
import { buildNotification } from './notify.ts';
import { sendPush } from './push.ts';
import { listSnapshotDates, readSnapshot } from './storage.ts';

/**
 * Envoie une notification de verification, sur demande.
 *
 * Le canal d'alerte *est* le produit, mais il ne se declenche qu'au hasard des
 * ouvertures de places : sans ce point d'entree, on ne decouvre qu'il est mort
 * qu'en manquant l'evenement qu'il devait signaler. Une panne cote FCM, un
 * jeton revoque a la reinstallation, un canal Android supprime — rien de tout
 * cela ne se voit dans un run vert.
 *
 * Le message part du vrai diff des deux derniers snapshots, en ignorant la
 * watchlist : c'est le chemin de production, avec du contenu reel, donc le tap
 * ouvre une date qui existe. Rien n'est ecrit, rien n'est simule.
 */
const dates = listSnapshotDates();

if (dates.length < 2) {
  console.error(`[test] ${dates.length} snapshot(s), il en faut deux pour un diff`);
  process.exit(1);
}

const [previousDate, currentDate] = dates.slice(-2) as [string, string];
const previous = readSnapshot(previousDate).filter(isTracked);
const current = readSnapshot(currentDate).filter(isTracked);

const { events, newDates } = diffSnapshots(previous, current);
console.log(
  `[test] ${previousDate} -> ${currentDate} : ${events.length} evenements, ${newDates.length} dates entrantes`,
);

const notification = buildNotification(events, newDates);

if (!notification) {
  console.error('[test] aucun evenement entre ces deux snapshots, rien a envoyer');
  process.exit(1);
}

const outcome = await sendPush(notification);

if (outcome !== 'sent') {
  console.error(`[test] non envoye : ${outcome}`);
  process.exit(1);
}

console.log(`[test] ouvre ${notification.url}`);
