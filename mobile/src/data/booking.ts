import { cancelConfirmReminder, scheduleConfirmReminder } from './reminders.ts';
import type { Reservation, Reservations } from '../../../src/types.ts';

/**
 * Marquer ou demarquer une reservation, d'un seul geste.
 *
 * Le geste n'etait qu'un ajout : rebalayer le meme train l'enregistrait une
 * seconde fois, et la seule facon de defaire etait d'aller dans les reglages.
 * Un geste qui ne sait pas se defaire la ou il se fait n'est pas un geste,
 * c'est un formulaire.
 *
 * L'ecriture est idempotente par construction — on retire toujours avant
 * d'ajouter — plutot que conditionnee a un etat lu depuis le rendu precedent :
 * deux balayages rapproches ne peuvent donc pas creer de doublon.
 */
export function toggleBooking(
  setReservations: (update: (current: Reservations) => Reservations) => void,
  slot: Reservation,
  booked: boolean,
): void {
  setReservations((current) => {
    const rest = current.slots.filter((entry) => !isSameSlot(entry, slot));
    return { slots: booked ? rest : [...rest, slot] };
  });

  /*
   * Le rappel suit l'etat connu du rendu, pas celui de l'ecriture.
   *
   * Les deux ne peuvent diverger que sur deux gestes dans la meme frame, et
   * `syncConfirmReminders` reconcilie de toute facon au chargement suivant.
   * Poser un effet a l'interieur d'une fonction de mise a jour serait pire :
   * React se reserve le droit de l'appeler plusieurs fois.
   */
  void (booked ? cancelConfirmReminder(slot) : scheduleConfirmReminder(slot));
}

/** Une date, un sens, un train : ce qui fait qu'une reservation est la meme. */
function isSameSlot(
  a: Pick<Reservation, 'date' | 'dir' | 'trainNo'>,
  b: Pick<Reservation, 'date' | 'dir' | 'trainNo'>,
): boolean {
  return a.date === b.date && a.dir === b.dir && a.trainNo === b.trainNo;
}
