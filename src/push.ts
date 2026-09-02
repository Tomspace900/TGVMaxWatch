import webpush from 'web-push';
import { VAPID_PUBLIC_KEY } from './config.ts';
import { readJson } from './storage.ts';
import type { PushSubscriptionRecord } from './types.ts';
import type { Notification } from './notify.ts';

const SUBSCRIPTION_PATH = 'data/push-subscription.json';

export type PushOutcome = 'sent' | 'no-subscription' | 'not-configured';

/**
 * Variable d'environnement, vide traitee comme absente.
 *
 * Un secret GitHub non defini n'arrive pas en `undefined` mais en chaine vide,
 * et `??` ne rattrape que `null`/`undefined`. Sans ce filtre, une cle absente
 * traverse le garde-fou et fait tomber le collecteur.
 */
export function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Envoie l'unique message de l'execution.
 *
 * Le job cron *est* le backend d'envoi : il n'y a pas de serveur, l'abonnement
 * est versionne dans le repo et la cle privee vit dans un secret. Si le service
 * push repond 404 ou 410, l'abonnement est mort et le workflow doit echouer
 * bruyamment : le mail d'echec GitHub est alors le seul canal de secours.
 */
export async function sendPush(notification: Notification): Promise<PushOutcome> {
  const privateKey = env('VAPID_PRIVATE_KEY');
  const publicKey = env('VAPID_PUBLIC_KEY') ?? VAPID_PUBLIC_KEY;
  const subject = env('VAPID_SUBJECT') ?? 'mailto:tgvmax-watch@example.com';

  if (!privateKey || !publicKey || publicKey.startsWith('REPLACE_')) {
    console.warn('[push] cles VAPID absentes, notification non envoyee');
    return 'not-configured';
  }

  const subscription = readJson<PushSubscriptionRecord | null>(SUBSCRIPTION_PATH, null);
  if (!subscription?.endpoint) {
    // Pas encore d'abonnement : la PWA n'a jamais ete installee. Ce n'est pas
    // une panne, contrairement a un abonnement rejete par le service push.
    console.warn('[push] aucun abonnement enregistre, notification non envoyee');
    return 'no-subscription';
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(notification),
      { TTL: 12 * 3600 },
    );
    console.log(`[push] envoye : ${notification.title}`);
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      throw new Error(
        `[push] abonnement rejete (HTTP ${status}). Le canal d'alerte est mort : ` +
          'reinstaller la PWA pour en enregistrer un nouveau.',
        { cause: error },
      );
    }
    throw error;
  }
}
