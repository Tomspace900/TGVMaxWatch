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

/** `12 trains`, `1 train`, `aucun train`. */
export function trainsLabel(count: number): string {
  return count === 0 ? 'aucun train' : `${count} ${trainsWord(count)}`;
}

/** Le seul nom, accorde : a poser a cote d'un chiffre deja affiche. */
export function trainsWord(count: number): string {
  return count > 1 ? 'trains' : 'train';
}
