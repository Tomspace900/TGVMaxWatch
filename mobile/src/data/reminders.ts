import * as Notifications from 'expo-notifications';
import {
  APP_URL,
  CONFIRM_DEADLINE_HOUR,
  CONFIRM_LAST_CALL_HOUR,
  CONFIRM_LAST_MINUTES_BEFORE,
  CONFIRM_REMINDER_HOUR,
  CONFIRM_URL,
  STALE_ALARM_HOURS,
} from '../../../src/config.ts';
import type { Reservation } from '../../../src/types.ts';
import { CHANNELS } from './notifications.ts';
import { confirmDeadline, dirLabel, eveOf, longDate } from '../format.ts';

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

/** Ce qui distingue deux creneaux, et rien d'autre : la cle des identifiants. */
function slotKey(slot: Pick<Reservation, 'date' | 'dir' | 'trainNo'>): string {
  return `${slot.date}|${slot.dir}|${slot.trainNo}`;
}

/** Un rappel par creneau et par echeance : reposer le meme identifiant remplace. */
function confirmId(slot: Pick<Reservation, 'date' | 'dir' | 'trainNo'>, tag: string): string {
  return `confirm:${slotKey(slot)}#${tag}`;
}

/** Un rappel a poser : quand il part, et le mot qu'il porte. */
interface Alarm {
  tag: string;
  when: Date;
  title: string;
}

/**
 * Les rappels d'un creneau, dans l'ordre.
 *
 * Deux instants prevus — 10 h puis 15 h la veille — parce qu'un rappel ne part
 * qu'une fois : celui de 10 h donne la marge qu'on lui demande, celui de 15 h
 * rattrape la matinee ou le telephone etait dans une poche. Le second dit qu'il
 * est le dernier, sans quoi il se lit comme un doublon du premier.
 *
 * Et un filet, qui **remplace** les deux au lieu de s'y ajouter : un creneau
 * enregistre la veille apres 15 h n'avait aucun rappel du tout, le code se
 * retirant en silence alors qu'il restait des heures pour agir. C'est la faute
 * de fond de ce projet, jouee sur la seule chose qui coute de l'argent.
 *
 * Rien apres l'echeance, jamais : la place est perdue, et un message qui arrive
 * trop tard n'apprend qu'une mauvaise nouvelle.
 */
function confirmAlarms(slot: Pick<Reservation, 'date'>, now: number): Alarm[] {
  const deadline = confirmDeadline(slot.date).getTime();
  if (deadline <= now) return [];

  const usable = (when: Date) => when.getTime() > now && when.getTime() < deadline;

  const planned: Alarm[] = [
    {
      tag: 'first',
      when: eveOf(slot.date, CONFIRM_REMINDER_HOUR),
      title: `Confirme ta resa avant ${CONFIRM_DEADLINE_HOUR}h`,
    },
    {
      tag: 'last',
      when: eveOf(slot.date, CONFIRM_LAST_CALL_HOUR),
      title: `Dernier rappel : confirme avant ${CONFIRM_DEADLINE_HOUR}h`,
    },
  ].filter((alarm) => usable(alarm.when));

  if (planned.length > 0) return planned;

  const late = {
    tag: 'late',
    when: new Date(deadline - CONFIRM_LAST_MINUTES_BEFORE * 60_000),
    title: `Confirme maintenant, echeance a ${CONFIRM_DEADLINE_HOUR}h`,
  };
  return usable(late.when) ? [late] : [];
}

/** Pose un rappel. Une permission refusee ne fait pas echouer l'enregistrement. */
async function post(slot: Reservation, alarm: Alarm): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: confirmId(slot, alarm.tag),
      content: {
        title: alarm.title,
        // Le sens est la seule chose qu'on ne peut pas deviner d'un coup d'oeil.
        body: `${longDate(slot.date)} · ${slot.depart} · ${dirLabel(slot.dir)}`,
        data: { url: CONFIRM_URL },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alarm.when,
        channelId: CHANNELS.confirm,
      },
    });
  } catch {
    // Permission refusee ou service indisponible : l'enregistrement du creneau
    // ne doit pas echouer pour autant.
  }
}

/** Pose les rappels de confirmation d'un creneau. */
export async function scheduleConfirmReminder(slot: Reservation): Promise<void> {
  for (const alarm of confirmAlarms(slot, Date.now())) await post(slot, alarm);
}

/** Retire les rappels d'un creneau : confirmation faite, ou creneau libere. */
export async function cancelConfirmReminder(
  slot: Pick<Reservation, 'date' | 'dir' | 'trainNo'>,
): Promise<void> {
  const prefix = `confirm:${slotKey(slot)}#`;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (notification.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
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
        channelId: CHANNELS.health,
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
 *
 * La reconciliation porte sur chaque rappel et non sur le creneau entier : un
 * creneau dont le rappel de 10 h est deja parti doit garder celui de 15 h, et
 * reposer les deux en bloc rejouerait un message deja lu.
 *
 * Elle emporte au passage les identifiants de l'ancienne forme — un seul rappel
 * par creneau, sans suffixe — qui ne correspondent plus a rien de voulu : sans
 * cela une installation existante garderait pour toujours une alarme que plus
 * aucun code ne sait annuler.
 */
export async function syncConfirmReminders(slots: Reservation[]): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const now = Date.now();

    const wanted = new Map<string, { slot: Reservation; alarm: Alarm }>();
    for (const slot of slots) {
      if (slot.confirmed) continue;
      for (const alarm of confirmAlarms(slot, now)) {
        wanted.set(confirmId(slot, alarm.tag), { slot, alarm });
      }
    }

    for (const notification of scheduled) {
      const id = notification.identifier;
      if (!id.startsWith('confirm:')) continue;
      if (wanted.has(id)) wanted.delete(id);
      else await Notifications.cancelScheduledNotificationAsync(id);
    }

    for (const { slot, alarm } of wanted.values()) await post(slot, alarm);
  } catch {
    // Sans acces aux notifications programmees, on laisse l'etat en place.
  }
}
