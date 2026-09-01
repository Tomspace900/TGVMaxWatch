/**
 * Lien vers SNCF Connect.
 *
 * Le plan prevoyait un gabarit d'URL interpole avec l'origine, la destination,
 * la date et l'heure. Verification faite, ce gabarit n'existe pas : SNCF
 * Connect est une SPA dont la page de resultats est toujours la meme URL sans
 * parametre — `/home/shop/results/outward` —, et la recherche vit dans l'etat
 * du client. Rien a interpoler, donc, et rien qui puisse se casser plus tard :
 * il n'y a simplement pas de lien profond a construire.
 *
 * On ouvre donc l'accueil, et la recherche se fait a la main. Android App Links
 * ouvrira l'application si elle revendique le domaine, le navigateur sinon —
 * les deux degradations sont acceptables.
 *
 * Si la SNCF publie un jour un schema de lien profond, il n'y a que cette
 * fonction a reecrire.
 */

const HOME = 'https://www.sncf-connect.com/';

export function sncfConnectUrl(): string {
  return HOME;
}
