/**
 * Ce qu'une frise de disponibilite raconte, en un mot.
 *
 * `data/trains.json` porte, par train, une suite de `O`, `N` et `-` alignee sur
 * les dates de collecte. Trente cellules dessinees cote a cote demandent un
 * decodage, une legende permanente, et pres de mille vues sur un ecran de
 * journee — pour repondre moins bien que la phrase qu'on en tire.
 *
 * Le besoin porte sur la **confiance** : « ouvert depuis dix jours » et
 * « rouvert ce matin apres avoir ete complet » ne se decident pas pareil. Ni
 * l'un ni l'autre ne demande de voir trente etats.
 *
 * La regle vit ici, avec les autres lecteurs de la source, et non dans
 * l'interface : elle interprete l'archive, et une interface se remplace.
 */

export type VerdictKind =
  /** Ouvert, et il ne s'est jamais ferme sur la periode connue. */
  | 'stable'
  /** Ouvert depuis la derniere collecte seulement : il vient de rouvrir. */
  | 'rouvert'
  /** Ouvert, mais il a bascule plusieurs fois : ne pas s'y fier. */
  | 'instable'
  /** Ferme au dernier point connu. */
  | 'complet'
  /** Rien d'exploitable : archive trop courte, ou train absent du dataset. */
  | 'inconnu';

export interface Verdict {
  kind: VerdictKind;
  /** Nombre de collectes consecutives dans l'etat courant. `0` si inconnu. */
  days: number;
}

/** Au-dela de ce nombre de bascules, un train ouvert n'est pas une promesse. */
const UNSTABLE_FLIPS = 3;

export function traceVerdict(trace?: string): Verdict {
  /*
   * Les jours sans donnee sont retires par la fin seulement.
   *
   * Un `-` final veut dire que le train n'etait pas dans le dataset a la
   * derniere collecte — il ne dit pas qu'il est complet, et le compter comme
   * tel inventerait une fermeture. Au milieu de la suite, en revanche, il
   * separe deux etats reels et doit rompre la serie.
   */
  const marks = (trace ?? '').replace(/-+$/, '');
  const current = marks[marks.length - 1];
  if (current !== 'O' && current !== 'N') return { kind: 'inconnu', days: 0 };

  let days = 0;
  for (let i = marks.length - 1; i >= 0 && marks[i] === current; i--) days++;

  if (current === 'N') return { kind: 'complet', days };

  const flips = countFlips(marks);
  if (days === marks.length) return { kind: 'stable', days };
  if (days <= 1) return { kind: 'rouvert', days };
  if (flips >= UNSTABLE_FLIPS) return { kind: 'instable', days };
  return { kind: 'stable', days };
}

/** Nombre de changements d'etat, les jours sans donnee en rompant la serie. */
function countFlips(marks: string): number {
  let flips = 0;
  let previous: string | undefined;

  for (const mark of marks) {
    if (mark !== 'O' && mark !== 'N') {
      previous = undefined;
      continue;
    }
    if (previous !== undefined && mark !== previous) flips++;
    previous = mark;
  }

  return flips;
}

/**
 * Le verdict en clair, avec sa duree.
 *
 * La duree *est* la taille d'echantillon : « ouvert · 4 j » dit a la fois l'etat
 * et sur combien d'observations il tient. Sur une archive de quatre jours,
 * c'est exactement ce qu'il faut savoir.
 */
export function verdictLabel(verdict: Verdict): string {
  switch (verdict.kind) {
    case 'stable':
      return `ouvert · ${verdict.days} j`;
    case 'rouvert':
      return 'vient de rouvrir';
    case 'instable':
      return 'ouvert · instable';
    case 'complet':
      return `complet · ${verdict.days} j`;
    case 'inconnu':
      return 'pas encore de recul';
  }
}

/**
 * Vrai quand le verdict merite d'etre montre a cote d'un train, dans une liste.
 *
 * « Ouvert et stable » est le cas majoritaire : l'ecrire sur trente-cinq lignes
 * en fait un fond, pas un signal. Seuls comptent les deux cas qui changent une
 * decision.
 */
export function isNotable(verdict: Verdict): boolean {
  return verdict.kind === 'rouvert' || verdict.kind === 'instable';
}
