/**
 * Les moments de la journee, tels qu'on les nomme.
 *
 * Personne ne pense « apres 16h07 » : on pense « le vendredi soir ». Ces
 * quatre periodes sont la traduction de cette facon de decider en fenetres
 * `after` / `before`, que la watchlist sait deja lire.
 *
 * **Elles se recouvrent d'une heure, volontairement.** Un depart a 11h30 est
 * autant une fin de matinee qu'un debut de midi : avec des bornes jointives,
 * quelqu'un qui suit « le matin » manquerait ce train pour trente minutes, sans
 * jamais comprendre pourquoi. Le recouvrement coute quelques trains suivis en
 * trop ; la coupure nette coute celui qu'on cherchait.
 *
 * La regle vit dans `src/` et non dans l'interface parce que deux ecrans s'en
 * servent — le formulaire de creneau recurrent et les raccourcis d'une journee —
 * et que deux tables de periodes qui divergent d'une heure sont impossibles a
 * diagnostiquer depuis l'ecran.
 */

export interface Period {
  key: string;
  label: string;
  /** Borne basse incluse, `HH:MM`. */
  after: string;
  /** Borne haute incluse, `HH:MM`. */
  before: string;
}

export const DAY_PERIODS: readonly Period[] = [
  { key: 'matin', label: 'matin', after: '05:00', before: '12:00' },
  { key: 'midi', label: 'midi', after: '11:00', before: '16:00' },
  { key: 'aprem', label: 'après-midi', after: '15:00', before: '20:00' },
  { key: 'soir', label: 'soir', after: '19:00', before: '23:59' },
] as const;

/**
 * La periode que designe une fenetre, si elle en designe une.
 *
 * Sert a relire une entree de suivi : `05:00–12:00` se reaffiche « matin »
 * plutot qu'en chiffres. Une fenetre posee a la main dans le depot ne
 * correspondra a rien, et c'est tres bien : on affichera ses bornes.
 */
export function periodOf(after?: string, before?: string): Period | null {
  if (!after || !before) return null;
  return DAY_PERIODS.find((period) => period.after === after && period.before === before) ?? null;
}
