import { readJson } from './storage.ts';
import type { Notification } from './notify.ts';
import type { PushTokenRecord } from './types.ts';

const TOKEN_PATH = 'data/push-token.json';

/**
 * Variable d'environnement, vide traitee comme absente.
 *
 * Un secret GitHub non defini n'arrive pas en `undefined` mais en chaine vide,
 * et `??` ne rattrape que `null`/`undefined`. Le trim couvre le cas d'un
 * secret colle avec un retour a la ligne, qui passerait sinon pour une valeur.
 */
export function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Point d'envoi du service Expo Push.
 *
 * Surchargeable pour rejouer la chaine contre un faux endpoint : sans ce
 * seam, le chemin de notification ne se verifie nulle part avant la premiere
 * execution reelle.
 */
const DEFAULT_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Lu a l'appel et non au chargement : l'environnement peut changer entre les deux. */
const pushUrl = (): string => env('TGVMAX_PUSH_URL') ?? DEFAULT_PUSH_URL;

/** Plafond du payload accepte par Expo, Android et iOS confondus. */
const MAX_PAYLOAD_BYTES = 4096;

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export type PushOutcome = 'sent' | 'no-subscription' | 'not-configured';


interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Envoie l'unique message de l'execution via le service Expo Push.
 *
 * Le job cron *est* le backend d'envoi : il n'y a pas de serveur, le jeton est
 * versionne dans le depot et l'envoi part de l'Action.
 *
 * Le jeton etant public, la requete est signee avec EXPO_TOKEN : l'API Expo
 * accepte par defaut n'importe quel appel non authentifie, et sans cette
 * signature toute personne lisant le depot pourrait envoyer des notifications
 * sur le telephone. Cote compte Expo, l'option « enhanced push security » rend
 * cette authentification obligatoire, ce qui ferme la porte pour de bon.
 */
export async function sendPush(notification: Notification): Promise<PushOutcome> {
  const record = readJson<PushTokenRecord | null>(TOKEN_PATH, null);

  if (!record?.expoPushToken) {
    // Pas encore de jeton : l'application n'a jamais demande la permission.
    // Ce n'est pas une panne, contrairement a un jeton rejete.
    console.warn('[push] aucun jeton enregistre, notification non envoyee');
    return 'no-subscription';
  }

  await sendToExpo(notification, record.expoPushToken);
  return 'sent';
}

/**
 * Envoi proprement dit, separe de la lecture du jeton pour etre testable :
 * le chemin d'erreur — jeton rejete, reprise sur 429 — ne se verifie
 * autrement que sur un envoi reel.
 */
export async function sendToExpo(
  notification: Notification,
  expoPushToken: string,
): Promise<void> {
  const message = {
    to: expoPushToken,
    title: notification.title,
    body: notification.body,
    data: { url: notification.url },
    // Le canal doit exister cote application ; il y est cree au demarrage.
    channelId: 'alerts',
    priority: 'high',
    sound: 'default',
  };

  const payload = JSON.stringify(message);
  if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
    throw new Error(`[push] payload de ${Buffer.byteLength(payload)} octets, au-dela de la limite`);
  }

  const ticket = await post(payload);

  if (ticket.status === 'error') {
    /*
     * `DeviceNotRegistered` signifie que l'application a ete desinstallee ou
     * que la permission a ete retiree : le canal d'alerte est mort et il faut
     * le savoir. On echoue donc bruyamment — le mail d'echec de GitHub est le
     * seul canal de secours quand le push ne passe plus.
     */
    throw new Error(
      `[push] envoi refuse (${ticket.details?.error ?? 'erreur inconnue'}) : ${ticket.message ?? ''}`,
    );
  }

  console.log(`[push] envoye : ${notification.title}`);
}

/** POST vers Expo, avec reprise sur les erreurs temporaires. */
async function post(payload: string): Promise<PushTicket> {
  const token = env('EXPO_TOKEN');
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[push] tentative ${attempt + 1} dans ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(pushUrl(), {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: payload,
      });

      // 429 et 5xx sont temporaires : l'API demande une reprise en backoff.
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as {
        data?: PushTicket | PushTicket[];
        errors?: { message?: string }[];
      };

      if (result.errors?.length) {
        throw new Error(`[push] requete refusee : ${result.errors[0]?.message ?? 'sans detail'}`);
      }

      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!ticket) throw new Error('[push] reponse sans ticket');
      return ticket;
    } catch (error) {
      lastError = error;
      // Une requete refusee sur le fond ne se rejoue pas.
      if (error instanceof Error && error.message.startsWith('[push] requete refusee')) throw error;
    }
  }

  throw new Error(`[push] envoi impossible apres ${RETRY_DELAYS_MS.length + 1} tentatives`, {
    cause: lastError,
  });
}
