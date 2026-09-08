import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

/**
 * Trois canaux, un par nature de message.
 *
 * Couper durablement une categorie et balayer un message une fois sont deux
 * besoins differents : Android ne sait exprimer le premier que par canal. Avec
 * un canal unique, faire taire les rappels de confirmation faisait taire aussi
 * les alertes de disponibilite — c'est-a-dire tout le produit.
 *
 * `alerts` garde son identifiant historique : un canal deja cree sur l'appareil
 * ne se reconfigure pas, et le collecteur envoie sur ce nom-la.
 */
export const CHANNELS = {
  /** Disponibilites : alertes generales et creneaux suivis, envoyees par le collecteur. */
  alerts: 'alerts',
  /** Rappel de confirmation : une alarme locale, a heure fixe, qui coute de l'argent si on la rate. */
  confirm: 'confirm',
  /** Panne de collecte : l'appareil s'alarme lui-meme d'un silence trop long. */
  health: 'health',
} as const;

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
 * Canaux de notification Android.
 *
 * Obligatoires depuis Android 8 : un message dont le canal n'existe pas n'est
 * pas affiche. Ils sont crees au demarrage, donc en JavaScript — ce qui permet
 * de les faire evoluer par mise a jour OTA, sans reconstruire l'application.
 *
 * Attention : Android verrouille les reglages d'un canal des sa creation. En
 * ajouter un nouveau fonctionne ; changer l'importance d'un canal existant ne
 * prend jamais effet sur les appareils qui l'ont deja.
 */
export async function ensureChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNELS.alerts, {
    name: 'Disponibilités',
    description: 'Une date qui rouvre, un créneau qui se vide, tes créneaux suivis.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#24AA7D',
  });

  await Notifications.setNotificationChannelAsync(CHANNELS.confirm, {
    name: 'Rappel de confirmation',
    description: 'La veille d’un voyage enregistré. Sans confirmation avant 17 h, la place est perdue.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#C21758',
  });

  await Notifications.setNotificationChannelAsync(CHANNELS.health, {
    name: 'Panne de collecte',
    description: 'Quand aucune donnée nouvelle n’arrive pendant 40 h.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#C21758',
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
    void ensureChannels();

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
