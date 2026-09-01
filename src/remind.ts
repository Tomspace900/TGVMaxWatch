import { CONFIRM_DAYS_BEFORE } from './config.ts';
import { addDays, hourInParis, todayInParis } from './dates.ts';
import { dirLabel, shortDate } from './notify.ts';
import { sendPush } from './push.ts';
import { readReservations, readState, writeState } from './storage.ts';

/** Heure locale a laquelle le rappel doit partir. */
const REMINDER_HOUR = 16;

/**
 * Rappel de confirmation.
 *
 * Le cron GitHub est en UTC, Paris oscille entre UTC+1 et UTC+2 : le workflow
 * se declenche donc a 14h et a 15h UTC, et c'est ce garde-fou qui laisse
 * passer la seule execution qui tombe reellement a 16h heure de Paris.
 */
async function main(): Promise<void> {
  const hour = hourInParis();
  if (hour !== REMINDER_HOUR) {
    console.log(`[remind] il est ${hour}h a Paris, ce n'est pas l'execution utile`);
    return;
  }

  const deadline = addDays(todayInParis(), CONFIRM_DAYS_BEFORE);
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
    writeState({ ...readState(), lastPushOk: new Date().toISOString() });
  }
}

await main();
