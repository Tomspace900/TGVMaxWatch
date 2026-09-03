import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

/** Identifiant du canal, aligne sur celui qu'envoie le collecteur. */
export const CHANNEL_ID = 'alerts';

/**
 * Une notification recue alors que l'application est au premier plan doit
 * quand meme s'afficher : sans ce reglage, Android l'avale silencieusement et
 * on croit le canal casse alors qu'il fonctionne.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Canal de notification Android.
 *
 * Obligatoire depuis Android 8 : un message dont le canal n'existe pas n'est
 * pas affiche. Il est cree au demarrage, donc en JavaScript — ce qui permet
 * de le faire evoluer par mise a jour OTA, sans reconstruire l'application.
 */
export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Disponibilités',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#24AA7D',
  });
}

/**
 * Ouvre le jour concerne quand on tape la notification.
 *
 * Le collecteur met dans `data.url` un lien vers la date et le sens a l'origine
 * de l'alerte : arriver sur le calendrier obligerait a rechercher soi-meme ce
 * dont on vient d'etre prevenu.
 */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    void ensureChannel();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.['url'];
      if (typeof url !== 'string') return;

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }

      /*
       * Tout ne pointe pas vers un ecran de l'application. Le rappel de
       * confirmation renvoie vers SNCF Connect, ou se fait l'action demandee :
       * faute de ce cas, il ne restait qu'un lien sans date, et taper la
       * notification ne faisait rien du tout.
       */
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void Linking.openURL(url);
        return;
      }

      const date = parsed.searchParams.get('date');
      const dir = parsed.searchParams.get('dir');
      if (date) router.push({ pathname: '/day/[date]', params: { date, ...(dir ? { dir } : {}) } });
    });

    return () => subscription.remove();
  }, [router]);
}
