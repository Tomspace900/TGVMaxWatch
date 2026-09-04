import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * Jeton de notification Expo.
 *
 * Le jeton est publie dans `data/push-token.json`, ou le collecteur le lit pour
 * envoyer via le service Expo Push. Il tourne a chaque reinstallation de
 * l'application : un depot qui porte l'ancien fait pousser le collecteur dans
 * le vide, et rien ne le dirait. Comparer les deux est donc la seule facon de
 * voir cette panne-la, qui est silencieuse comme toutes les autres ici.
 *
 * Rien n'est mis en cache sur l'appareil : la permission accordee, obtenir le
 * jeton courant ne coute qu'un aller-retour et n'ouvre aucune fenetre. Une
 * copie locale ne ferait qu'ajouter une source de verite de plus, qui aurait
 * pu diverger.
 */

export type PushStatus =
  /** Emulateur, ou build sans projet EAS : aucun jeton n'est obtenable. */
  | 'unsupported'
  /** Permission refusee, et le systeme ne laisse plus redemander. */
  | 'denied'
  /** Permission jamais accordee. */
  | 'off'
  /** Permission accordee, mais le jeton n'a pas pu etre lu — hors ligne. */
  | 'unknown'
  /** Cet appareil a un jeton, mais le depot en porte un autre. */
  | 'stale'
  /** Le depot porte le jeton de cet appareil : les alertes arrivent. */
  | 'ready';

export interface PushState {
  status: PushStatus;
  token: string | null;
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId
  );
}

async function tokenOfThisDevice(): Promise<string | null> {
  try {
    const id = projectId();
    if (!id) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return data;
  } catch {
    // Sans reseau, Expo ne peut pas delivrer de jeton. Ce n'est pas une panne.
    return null;
  }
}

function compare(token: string | null, publishedToken: string | null): PushState {
  if (!token) return { status: 'unknown', token: null };
  return { status: token === publishedToken ? 'ready' : 'stale', token };
}

/**
 * Etat actuel, **sans jamais ouvrir de fenetre de permission**.
 *
 * C'est le defaut que cet ecran avait : l'etat partait de « off » a chaque
 * ouverture, et proposait donc indefiniment d'activer des notifications deja
 * actives.
 */
export async function currentPushState(publishedToken: string | null): Promise<PushState> {
  if (!Device.isDevice || !projectId()) return { status: 'unsupported', token: null };

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    // Un refus definitif se repare dans les reglages Android, pas ici : les
    // deux cas ne demandent pas le meme geste.
    return { status: permission.canAskAgain ? 'off' : 'denied', token: null };
  }

  return compare(await tokenOfThisDevice(), publishedToken);
}

/**
 * Demande la permission si besoin, puis rend le jeton de cet appareil.
 *
 * Le statut vaut `stale` tant que l'appelant n'a pas publie ce jeton dans le
 * depot : c'est lui qui sait ecrire, pas nous.
 */
export async function requestPushToken(publishedToken: string | null): Promise<PushState> {
  if (!Device.isDevice || !projectId()) return { status: 'unsupported', token: null };

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();

  if (!permission.granted) {
    return { status: permission.canAskAgain ? 'off' : 'denied', token: null };
  }

  return compare(await tokenOfThisDevice(), publishedToken);
}
