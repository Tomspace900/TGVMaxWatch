import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trainsLabel, trainsWord } from '../src/label.ts';

/*
 * Le vocabulaire est teste parce qu'il a deja ete faux partout.
 *
 * La source ne publie aucun stock de sieges : ce que ce projet compte, ce sont
 * des trains ouverts au TGVmax. Ces trois assertions sont la pour qu'un « place »
 * ne revienne pas par la fenetre.
 */
describe('trainsLabel', () => {
  it('ne parle jamais de places', () => {
    assert.equal(trainsLabel(0), 'aucun train');
    assert.equal(trainsLabel(1), '1 train');
    assert.equal(trainsLabel(12), '12 trains');
  });

  it('accorde le nom seul', () => {
    assert.equal(trainsWord(0), 'train');
    assert.equal(trainsWord(1), 'train');
    assert.equal(trainsWord(2), 'trains');
  });
});
