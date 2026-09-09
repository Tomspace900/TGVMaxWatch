import { foldDepartures } from './departures.ts';
import { diffSnapshots } from './diff.ts';
import { isTracked } from './duration.ts';
import { buildNotification } from './notify.ts';
import { sendPush } from './push.ts';
import { listSnapshotDates, readSnapshot, readWatchlist } from './storage.ts';

/**
 * Envoie une notification de verification, sur demande.
 *
 * Le canal d'alerte *est* le produit, mais il ne se declenche qu'au hasard des
 * ouvertures de places : sans ce point d'entree, on ne decouvre qu'il est mort
 * qu'en manquant l'evenement qu'il devait signaler. Une panne cote FCM, un
 * jeton revoque a la reinstallation, un canal Android supprime — rien de tout
 * cela ne se voit dans un run vert.
 *
 * Le message part du vrai diff des deux derniers snapshots. Les evenements de
 * train ne sont pas filtres par la watchlist — sinon le test n'aurait presque
 * jamais rien a envoyer — mais les **creneaux suivis**, eux, la reclament : un
 * signal de creneau n'existe que parce qu'on a demande a suivre cette fenetre.
 * L'ignorer priverait le test du seul type d'alerte qu'il ne peut pas
 * fabriquer. C'est le chemin de production, avec du contenu reel, donc le tap
 * ouvre une date qui existe. Rien n'est ecrit, rien n'est simule.
 */
const dates = listSnapshotDates();

if (dates.length < 2) {
  console.error(`[test] ${dates.length} snapshot(s), il en faut deux pour un diff`);
  process.exit(1);
}

/**
 * La paire de snapshots a rejouer, `AAAA-MM-JJ..AAAA-MM-JJ`.
 *
 * Par defaut les deux derniers, qui sont ce que le collecteur vient de voir.
 * Mais une journee ordinaire ne contient souvent que des ouvertures de train :
 * mesure sur l'archive, quatre journees sur huit ne portent aucun signal, et
 * les fermetures se font pousser hors du message par les ouvertures. Le test ne
 * pouvait donc pas exercer les chemins qui comptent — un creneau suivi qui
 * s'ouvre, une date qui se vide — alors que l'archive les contient.
 *
 * On rejoue une vraie paire, jamais des donnees fabriquees : ce qui part sur le
 * telephone doit etre quelque chose qui a reellement eu lieu.
 */
function chosenPair(): [string, string] {
  const raw = process.env['TGVMAX_TEST_PAIR']?.trim();
  if (!raw) return dates.slice(-2) as [string, string];

  const [from, to] = raw.split('..');
  if (!from || !to || !dates.includes(from) || !dates.includes(to)) {
    console.error(`[test] paire « ${raw} » introuvable dans l'archive`);
    process.exit(1);
  }
  return [from, to];
}

const [previousDate, currentDate] = chosenPair();
const previous = foldDepartures(readSnapshot(previousDate).filter(isTracked));
const current = foldDepartures(readSnapshot(currentDate).filter(isTracked));

/*
 * Le diff est cadre sur la date de collecte du snapshot le plus recent, et non
 * sur aujourd'hui : c'est l'horizon qu'avait le collecteur ce jour-la. Prendre
 * la date du jour ecarterait, sur une archive un peu ancienne, toutes les dates
 * de voyage entre-temps passees — et le test n'aurait plus rien a envoyer.
 */
const { events, signals, slots } = diffSnapshots(
  previous,
  current,
  currentDate,
  readWatchlist(),
);
console.log(
  `[test] ${previousDate} -> ${currentDate} : ${events.length} evenements, ` +
    `${signals.length} signaux, ${slots.length} creneaux suivis`,
);

const notification = buildNotification(events, signals, slots);

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
