import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNotable, traceVerdict, verdictLabel } from '../src/trace.ts';

describe('traceVerdict', () => {
  it('lit un train qui n a jamais ferme', () => {
    assert.deepEqual(traceVerdict('OOOO'), { kind: 'stable', days: 4 });
  });

  it('lit un train complet, avec la duree', () => {
    assert.deepEqual(traceVerdict('OONN'), { kind: 'complet', days: 2 });
  });

  it('repere une reouverture au dernier point', () => {
    assert.deepEqual(traceVerdict('OONNO'), { kind: 'rouvert', days: 1 });
  });

  it('repere un train qui bascule sans arret', () => {
    // Quatre bascules : ouvert, mais rien ne dit qu'il le restera.
    assert.equal(traceVerdict('ONONOO').kind, 'instable');
  });

  it('ne compte pas une reouverture apres deux jours ouverts', () => {
    assert.deepEqual(traceVerdict('NNOO'), { kind: 'stable', days: 2 });
  });

  /*
   * Un `-` final veut dire « absent du dataset ce jour-la », pas « complet ».
   * Le compter comme une fermeture inventerait un evenement.
   */
  it('ignore les jours sans donnee en fin de serie', () => {
    assert.deepEqual(traceVerdict('OOOO--'), { kind: 'stable', days: 4 });
  });

  it('rompt la serie sur un trou au milieu', () => {
    assert.deepEqual(traceVerdict('OO-OO'), { kind: 'stable', days: 2 });
  });

  it('rend inconnu ce qui n a rien a dire', () => {
    assert.deepEqual(traceVerdict(undefined), { kind: 'inconnu', days: 0 });
    assert.deepEqual(traceVerdict('---'), { kind: 'inconnu', days: 0 });
    assert.deepEqual(traceVerdict(''), { kind: 'inconnu', days: 0 });
  });
});

describe('verdictLabel', () => {
  it('porte sa taille d echantillon avec l etat', () => {
    assert.equal(verdictLabel(traceVerdict('OOOO')), 'ouvert · 4 j');
    assert.equal(verdictLabel(traceVerdict('OONN')), 'complet · 2 j');
    assert.equal(verdictLabel(traceVerdict('NNNO')), 'vient de rouvrir');
  });
});

describe('isNotable', () => {
  /*
   * « Ouvert et stable » est le cas majoritaire : l'ecrire sur trente-cinq
   * lignes en fait un fond. Seuls les deux cas qui changent une decision
   * meritent de sortir dans une liste.
   */
  it('ne retient que ce qui change une decision', () => {
    assert.equal(isNotable(traceVerdict('NNNO')), true);
    assert.equal(isNotable(traceVerdict('ONONOO')), true);
    assert.equal(isNotable(traceVerdict('OOOO')), false);
    assert.equal(isNotable(traceVerdict('NNNN')), false);
  });
});
