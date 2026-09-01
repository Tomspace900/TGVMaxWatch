import { VAPID_PUBLIC_KEY } from '../../../src/config.ts';
import { readFile, writeFile } from './github.ts';
import type { PushSubscriptionRecord } from '../../../src/types.ts';

const SUBSCRIPTION_PATH = 'data/push-subscription.json';

/**
 * `applicationServerKey` attend un buffer, pas la chaine base64url.
 *
 * Le tableau est adosse a un `ArrayBuffer` explicite : la signature de
 * `PushManager.subscribe` refuse un `SharedArrayBuffer`.
 */
function toApplicationServerKey(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

function serialize(subscription: PushSubscription): PushSubscriptionRecord {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.['p256dh'] ?? '',
      auth: json.keys?.['auth'] ?? '',
    },
    updatedAt: new Date().toISOString(),
  };
}

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on' | 'unsynced';

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Demande la permission et enregistre l'abonnement dans le repo. */
export async function enablePush(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(VAPID_PUBLIC_KEY),
    }));

  await publish(serialize(subscription));
  return 'on';
}

/**
 * Verifie au demarrage que l'abonnement local correspond a celui commite.
 *
 * Un abonnement tourne a la reinstallation de la PWA ou a la rotation du
 * navigateur. Sans cette resynchronisation, le collecteur continuerait a
 * pousser vers un endpoint mort — et ferait echouer le workflow chaque jour.
 */
export async function syncSubscription(): Promise<PushStatus> {
  const subscription = await currentSubscription();
  if (!subscription) return 'off';

  try {
    const stored = await readFile<PushSubscriptionRecord>(SUBSCRIPTION_PATH);
    if (stored?.value.endpoint === subscription.endpoint) return 'on';
    await publish(serialize(subscription));
    return 'on';
  } catch {
    // Pas de jeton, ou GitHub injoignable : l'abonnement local existe mais on
    // ne peut pas garantir qu'il est celui que le collecteur utilise.
    return 'unsynced';
  }
}

async function publish(record: PushSubscriptionRecord): Promise<void> {
  await writeFile(SUBSCRIPTION_PATH, record, 'push: mise a jour de l abonnement');
}
