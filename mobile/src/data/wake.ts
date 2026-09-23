import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from '../../../src/config.ts';
import { todayInParis } from '../../../src/dates.ts';
import { foldDepartures } from '../../../src/departures.ts';
import { dateSignals } from '../../../src/diff.ts';
import { isTracked } from '../../../src/duration.ts';
import { buildNotification } from '../../../src/notify.ts';
import { watchSignals } from '../../../src/slots.ts';
import { pruneWatch } from '../../../src/watchlist.ts';
import type { State, TrainRecord } from '../../../src/types.ts';
import { watchCutoff } from '../format.ts';
import { readWatchlist } from './local.ts';
import { CHANNELS } from './notifications.ts';
import { scheduleStaleAlarm } from './reminders.ts';
import { readCache, writeCache } from './remote.ts';

/**
 * Le reveil : le collecteur a pousse un nouveau releve, le telephone decide.
 *
 * C'est le seul endroit ou ce qu'on suit rencontre la donnee du jour. Le
 * collecteur envoie un message sans rien a afficher ; Android lance ce JS, meme
 * application fermee, et c'est d'ici que part la notification — ou rien.
 *
 * La comparaison se fait avec **le dernier releve vu**, pas avec celui de la
 * veille : si un reveil se perd, le suivant raconte les deux jours au lieu d'en
 * oublier un. Et si les reveils cessent, l'alarme de fraicheur, qu'ils sont
 * seuls a repousser quand l'application reste fermee, finit par sonner.
 */

const TASK = 'tgvmax-wake';
const SEEN = 'seen-latest.json';

/**
 * Lu a la source, jamais au CDN : `raw.githubusercontent.com` resert l'ancien
 * fichier pendant cinq minutes, et le reveil arrive dans la minute du commit.
 */
async function fresh(path: string): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${REPO_BRANCH}`,
    { headers: { accept: 'application/vnd.github.raw+json', 'cache-control': 'no-cache' } },
  );
  if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
  return response.text();
}

export async function checkNews(): Promise<void> {
  const [stateRaw, latestRaw] = await Promise.all([fresh('data/state.json'), fresh('data/latest.json')]);
  const seen = await readCache<TrainRecord[]>(SEEN);

  if (seen) {
    const { watchlist } = await readWatchlist();
    const before = foldDepartures(seen.filter(isTracked));
    const after = foldDepartures((JSON.parse(latestRaw) as TrainRecord[]).filter(isTracked));
    const notification = buildNotification(
      watchSignals(pruneWatch(watchlist, watchCutoff()), before, after),
      dateSignals(before, after, todayInParis()),
    );
    if (notification) {
      await Notifications.scheduleNotificationAsync({
        content: { title: notification.title, body: notification.body, data: { url: notification.url } },
        trigger: { channelId: CHANNELS.alerts },
      });
    }
  }

  // Marque « vu » apres avoir prevenu, pas avant : un message rate se rejoue
  // au reveil suivant, un message marque vu sans etre parti serait perdu.
  await writeCache(SEEN, latestRaw);
  await scheduleStaleAlarm((JSON.parse(stateRaw) as State).collectedAt);
}

/**
 * Le premier releve vu, a la premiere ouverture : sans lui, le premier reveil
 * n'aurait rien a comparer et ne dirait rien.
 */
export async function seedSeen(latest: TrainRecord[]): Promise<void> {
  if (latest.length === 0 || (await readCache<unknown>(SEEN))) return;
  await writeCache(SEEN, JSON.stringify(latest));
}

// En portee globale : Android peut lancer ce JS sans monter le moindre ecran.
TaskManager.defineTask(TASK, async () => {
  try {
    await checkNews();
  } catch {
    // Hors reseau, GitHub injoignable : le prochain reveil couvrira les deux.
  }
});
void Notifications.registerTaskAsync(TASK).catch(() => {});
