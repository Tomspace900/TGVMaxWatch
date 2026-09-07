import * as Notifications from 'expo-notifications';
import {
  APP_URL,
  CONFIRM_DEADLINE_HOUR,
  CONFIRM_REMINDER_HOUR,
  CONFIRM_URL,
  STALE_ALARM_HOURS,
} from '../../../src/config.ts';
import type { Reservation } from '../../../src/types.ts';
import { CHANNEL_ID } from './notifications.ts';
import { dirLabel, eveOf, longDate } from '../format.ts';

/**
 * Rappels poses par l'appareil.
 *
 * Le rappel de confirmation tournait dans une GitHub Action, avec un garde-fou
 * horaire parisien pour absorber le retard du cron. Il ne s'est jamais
 * declenche : les quatre executions planifiees ont toutes trouve 19h ou 20h et
 * se sont retirees, en code 0, sans qu'un seul run ne devienne rouge.
 *
 * Une alarme locale n'a aucun de ces problemes. Elle part de l'appareil, dont
 * l'heure locale est celle de l'utilisateur, elle ne depend d'aucun cron, et
 * son absence se verrait dans les notifications programmees du systeme.
 */

/** Un rappel par creneau : reposer le meme identifiant remplace, sans doublon. */
function confirmId(slot: Pick<Reservation, 'date' | 'dir' | 'trainNo'>): string {
  return `confirm:${slot.date}|${slot.dir}|${slot.trainNo}`;
}

/** Instant du rappel : la veille du voyage, sept heures avant l'echeance. */
function confirmInstant(travelDate: string): Date {
  return eveOf(travelDate, CONFIRM_REMINDER_HOUR);
}

/**
 * Pose le rappel de confirmation d'un creneau.
 *
 * Ne pose rien si l'instant est deja passe — reserver la veille au soir pour le
 * lendemain est un cas normal, et une alarme dans le passe ne partirait jamais.
 */
export async function scheduleConfirmReminder(slot: Reservation): Promise<void> {
  const when = confirmInstant(slot.date);
  if (when.getTime() <= Date.now()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: confirmId(slot),
      content: {
        title: `Confirme ta resa avant ${CONFIRM_DEADLINE_HOUR}h`,
        // Le sens est la seule chose qu'on ne peut pas deviner d'un coup d'oeil.
        body: `${longDate(slot.date)} · ${slot.depart} · ${dirLabel(slot.dir)}`,
        data: { url: CONFIRM_URL },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Permission refusee ou service indisponible : l'enregistrement du creneau
    // ne doit pas echouer pour autant.
  }
}

/** Retire le rappel d'un creneau : confirmation faite, ou creneau libere. */
export async function cancelConfirmReminder(
  slot: Pick<Reservation, 'date' | 'dir' | 'trainNo'>,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(confirmId(slot));
  } catch {
    // Annuler un rappel qui n'existe pas n'est pas une erreur.
  }
}

const STALE_ID = 'stale';

/**
 * Alarme de collecte muette.
 *
 * C'est le seul dispositif capable de signaler une collecte morte. Une
 * notification push part du collecteur : s'il ne tourne plus, il ne peut pas
 * prevenir qu'il ne tourne plus. Le bandeau de fraicheur, lui, suppose qu'on
 * ouvre l'application.
 *
 * Reposee a chaque rafraichissement reussi : tant que la donnee arrive,
 * l'echeance recule et l'alarme ne sonne jamais.
 */
export async function scheduleStaleAlarm(collectedAt: string | null): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STALE_ID);
    if (!collectedAt) return;

    const when = new Date(Date.parse(collectedAt) + STALE_ALARM_HOURS * 3_600_000);
    // Deja perime : le bandeau le dit a l'ecran, sous les yeux de qui vient
    // d'ouvrir l'application. Une alarme dans le passe ne partirait pas, et
    // reveiller quelqu'un pour ce qu'il est en train de lire n'aiderait pas.
    if (when.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: STALE_ID,
      content: {
        title: 'Plus de collecte depuis deux jours',
        body: 'Le collecteur ne publie plus. Verifie le workflow sur GitHub.',
        data: { url: APP_URL },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Permission refusee : le bandeau de fraicheur reste le temoin visible.
  }
}

/**
 * Reconcilie les rappels programmes avec les creneaux reellement enregistres.
 *
 * Appelee au demarrage : un import de sauvegarde, une reinstallation ou une
 * confirmation faite sur un autre appareil laissent sinon des alarmes orphelines
 * ou, pire, des creneaux sans alarme.
 */
export async function syncConfirmReminders(slots: Reservation[]): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const wanted = new Map(
      slots.filter((slot) => !slot.confirmed).map((slot) => [confirmId(slot), slot]),
    );

    for (const notification of scheduled) {
      const id = notification.identifier;
      if (!id.startsWith('confirm:')) continue;
      if (wanted.has(id)) wanted.delete(id);
      else await Notifications.cancelScheduledNotificationAsync(id);
    }

    for (const slot of wanted.values()) await scheduleConfirmReminder(slot);
  } catch {
    // Sans acces aux notifications programmees, on laisse l'etat en place.
  }
}
