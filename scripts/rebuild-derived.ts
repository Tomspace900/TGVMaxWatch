import { todayInParis } from '../src/dates.ts';
import { rebuildDerived } from '../src/derive.ts';

/**
 * Refait `history.json`, `stats.json` et `trains.json` depuis l'archive.
 *
 * A lancer quand une regle d'agregation change — le passage de la rame au
 * depart, par exemple. Sans cela, les fichiers derives restent ceux de la
 * regle precedente jusqu'a la prochaine publication de la source, et
 * l'application, deja mise a jour par OTA, cherche des cles que l'ancien
 * fichier ne porte pas : elle n'affiche alors simplement rien, en silence.
 *
 * Ne touche pas a `data/snapshots/`, qui est la source de verite.
 */
rebuildDerived(todayInParis());
