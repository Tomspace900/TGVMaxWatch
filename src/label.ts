import { weekday } from './dates.ts';

/**
 * Le mot juste pour ce que compte ce projet.
 *
 * `od_happy_card = OUI` dit qu'un *train* est ouvert au TGVmax. La source ne
 * publie aucun stock de sieges, et n'en publiera jamais : « 8 places » etait
 * donc faux partout ou c'etait ecrit, dans l'application comme dans les
 * notifications, ou « 57 places ouvertes » annoncait en realite 57 trains.
 *
 * L'erreur ne se voyait pas sur le calendrier, ou le chiffre est nu, mais elle
 * devenait absurde des qu'il se posait a cote d'un horaire : « 8 places » en
 * face du train de 07h12 se lisait comme huit sieges dans ce train-la.
 *
 * La regle vit ici parce qu'elle interprete la source, pas dans l'interface :
 * `carrierLabel` a deja ete perdue une fois en changeant de front, et
 * l'application affichait « PASUDOUEST » sur quatre lignes sur cinq.
 */

const WEEKDAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const;

/**
 * Le jour de la semaine, en trois lettres.
 *
 * « le 14 » ne decide rien : c'est « lundi » qui dit si le voyage est possible.
 * La notification donnait la date nue, et il fallait ouvrir un calendrier pour
 * savoir de quel jour on parlait — sur le seul message dont tout l'interet est
 * d'etre lu d'un oeil.
 *
 * La table vit ici et non dans l'interface parce que les deux la lisent, et que
 * deux tables de jours qui divergeraient d'un rang seraient impossibles a
 * diagnostiquer depuis l'ecran.
 */
export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[weekday(iso)]!;
}

/** `12 trains`, `1 train`, `aucun train`. */
export function trainsLabel(count: number): string {
  return count === 0 ? 'aucun train' : `${count} ${trainsWord(count)}`;
}

/** Le seul nom, accorde : a poser a cote d'un chiffre deja affiche. */
export function trainsWord(count: number): string {
  return count > 1 ? 'trains' : 'train';
}

/**
 * `aucun train ouvert`, `1 train ouvert`, `5 trains ouverts`.
 *
 * L'adjectif etait accorde a la main de chaque cote — l'ecran d'un jour et la
 * liste de suivi ecrivaient tous deux `${trainsWord(n)} ouverts`, ce qui rendait
 * « 1 train **ouverts** ». Le nom vivait bien ici, l'adjectif non : une regle
 * d'accord recopiee est une regle d'accord qui diverge.
 */
export function openTrainsLabel(count: number): string {
  if (count === 0) return 'aucun train ouvert';
  return `${count} ${trainsWord(count)} ouvert${count > 1 ? 's' : ''}`;
}
