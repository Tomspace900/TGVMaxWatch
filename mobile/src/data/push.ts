import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * Jeton de notification Expo.
 *
 * Le collecteur ne s'en sert pas encore : la bascule de web-push vers l'API
 * Expo Push attend que les identifiants FCM soient en place. Cet ecran permet
 * d'obtenir et de publier le jeton des maintenant, pour que la bascule soit
 * une simple modification cote collecteur.
 */
export type PushStatus = 'unsupported' | 'denied' | 'off' | 'ready';

export async function requestPushToken(): Promise<{ status: PushStatus; token?: string }> {
  if (!Device.isDevice) {
    // Un emulateur n'a pas de service de notification : le jeton obtenu ne
    // recevrait jamais rien.
    return { status: 'unsupported' };
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted ||
    (await Notifications.requestPermissionsAsync()).granted;

  if (!granted) return { status: 'denied' };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    // Hors build EAS il n'y a pas de projet auquel rattacher le jeton.
    return { status: 'unsupported' };
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return { status: 'ready', token: token.data };
}
