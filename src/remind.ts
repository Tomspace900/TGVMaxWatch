import { CONFIRM_DAYS_BEFORE } from './config.ts';
import { addDays, hourInParis, isParisHourWithin, todayInParis } from './dates.ts';
import { dirLabel, shortDate } from './notify.ts';
import { sendPush } from './push.ts';
import { readReservations, readState, writeState } from './storage.ts';

/**
 * Fenetre parisienne pendant laquelle un rappel a encore un sens.
 *
 * Le rappel doit arriver avant 17h. Envoye apres, il ne sert plus a rien et
 * annonce une echeance deja passee — d'ou la borne haute, qui vaut refus.
 */
const REMINDER_FROM = 7;
const REMINDER_UNTIL = 16;

/**
 * Rappel de confirmation.
 *
 * Le cron GitHub est en UTC, Paris oscille entre UTC+1 et UTC+2 : le workflow
 * se declenche donc a 14h et a 15h UTC, et c'est ce garde-fou qui laisse
 * passer la seule execution qui tombe reellement a 16h heure de Paris.
 */
async function main(): Promise<void> {
  const hour = hourInParis();
  const today = todayInParis();

  /*
   * Ce garde-fou exigeait 16h pile, en ne comptant que l'heure d'ecart entre
   * l'ete et l'hiver. Le cron de ce depot part en realite avec trois a cinq
   * heures de retard : les quatre executions planifiees ont toutes trouve 20h
   * a Paris et se sont retirees. Le rappel n'est donc jamais parti.
   *
   * Une fenetre absorbe le retard sans jamais envoyer un rappel devenu faux.
   */
  if (!isParisHourWithin(REMINDER_FROM, REMINDER_UNTIL)) {
    console.log(
      `[remind] il est ${hour}h a Paris, hors de la fenetre ${REMINDER_FROM}h-${REMINDER_UNTIL}h`,
    );
    return;
  }

  // Deux executions quotidiennes tombent desormais toutes deux dans la
  // fenetre : sans cette marque, le rappel partirait en double.
  const state = readState();
  if (state.lastRemindOn === today) {
    console.log(`[remind] rappel deja envoye le ${today}`);
    return;
  }

  const deadline = addDays(today, CONFIRM_DAYS_BEFORE);
  const { slots } = readReservations();
  const pending = slots.filter((slot) => slot.date === deadline && !slot.confirmed);

  if (pending.length === 0) {
    console.log(`[remind] aucune reservation a confirmer pour le ${deadline}`);
    return;
  }

  const lines = pending.map(
    (slot) => `${shortDate(slot.date)} ${slot.depart} ${dirLabel(slot.dir)} n${slot.trainNo}`,
  );

  const outcome = await sendPush({
    title: `Confirme ta resa avant 17h`,
    body: lines.join('\n'),
    url: 'https://www.sncf-connect.com/app/mes-voyages',
    tag: 'tgvmax-confirm',
  });

  if (outcome === 'sent') {
    writeState({ ...readState(), lastPushOk: new Date().toISOString(), lastRemindOn: today });
  }
}

await main();
