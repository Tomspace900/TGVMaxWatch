import { readJson } from './storage.ts';
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

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export type PushOutcome = 'sent' | 'no-subscription' | 'not-configured';


interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Reveille le telephone : un message sans titre ni corps, que l'application
 * traite en arriere-plan.
 *
 * Il ne porte rien — ni sens, ni date, ni ce qu'on suit, que le collecteur ne
 * connait plus. Le telephone relit la donnee lui-meme, la compare a la
 * derniere qu'il a vue, et decide seul s'il y a quelque chose a dire.
 *
 * Le jeton etant public, la requete est signee avec EXPO_TOKEN : sans cette
 * signature, toute personne lisant le depot pourrait reveiller le telephone.
 * Cote compte Expo, l'option « enhanced push security » la rend obligatoire.
 */
export async function sendWake(): Promise<PushOutcome> {
  const record = readJson<PushTokenRecord | null>(TOKEN_PATH, null);
  if (!record?.expoPushToken) {
    console.warn('[push] aucun jeton enregistre, rien a reveiller');
    return 'no-subscription';
  }
  await wakeDevice(record.expoPushToken);
  return 'sent';
}

/** L'envoi lui-meme, separe de la lecture du jeton pour etre testable. */
export async function wakeDevice(expoPushToken: string): Promise<void> {
  // Ni `title`, ni `body`, ni `channelId` : n'importe lequel en ferait un
  // message affiche, et la tache de l'application ne tournerait pas.
  const ticket = await post(
    JSON.stringify({ to: expoPushToken, data: { wake: true }, priority: 'high' }),
  );

  // Un ticket `ok` dit seulement qu'Expo a recu. `DeviceNotRegistered` sort
  // parfois ici : l'application a ete desinstallee, le canal est mort.
  if (ticket.status === 'error') {
    throw new Error(
      `[push] reveil refuse (${ticket.details?.error ?? 'erreur inconnue'}) : ${ticket.message ?? ''}`,
    );
  }
  console.log('[push] telephone reveille');
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
