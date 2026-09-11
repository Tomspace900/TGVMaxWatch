import { Linking } from 'react-native';
import { BOOKING_URL } from '../../../src/config.ts';
import { cancelConfirmReminder, scheduleConfirmReminder } from './reminders.ts';
import type { Reservation, Reservations } from '../../../src/types.ts';

/**
 * Emmene reserver, la ou la reservation se fait reellement.
 *
 * Cette application ne reserve pas et ne reservera pas : elle amene a la bonne
 * date, SNCF fait le reste. Le balayage s'arretait pourtant a la porte — il
 * marquait le creneau, et il fallait sortir, retrouver l'autre application et
 * ressaisir le trajet a la main. Le geste va desormais jusqu'au bout.
 *
 * Volontairement separee de `toggleBooking` : le defaire de la barre d'annulation
 * repasse par lui pour remettre une reservation retiree, et rouvrir SNCF Connect
 * sur un defaire serait exactement le genre de geste qui part quand on ne le
 * demande pas.
 */
export function openBooking(): void {
  void Linking.openURL(BOOKING_URL).catch(() => {
    // Aucun navigateur ni application pour ce lien : le creneau est marque, le
    // rappel est pose, et c'est tout ce que cette application doit garantir.
  });
}

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
