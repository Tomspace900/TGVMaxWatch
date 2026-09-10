import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openTrainsLabel, trainsLabel, trainsWord, weekdayShort } from '../src/label.ts';

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

describe('jour de la semaine', () => {
  it('nomme les sept jours, dimanche compris', () => {
    // Le 2026-09-14 est un lundi ; la semaine se lit ensuite d'affilee.
    const semaine = [
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ].map(weekdayShort);

    assert.deepEqual(semaine, ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']);
  });

  it('ne convertit pas la date : elle est deja locale', () => {
    // Une conversion de fuseau ferait basculer d'un jour les dates de voyage.
    assert.equal(weekdayShort('2026-01-01'), 'jeu');
    assert.equal(weekdayShort('2026-12-31'), 'jeu');
  });
});

/*
 * L'adjectif etait accorde a la main de chaque cote — deux ecrans ecrivaient
 * `${trainsWord(n)} ouverts`, ce qui rendait « 1 train ouverts ». Une regle
 * d'accord recopiee est une regle d'accord qui diverge.
 */
describe('trains ouverts', () => {
  it('accorde le nom et l adjectif ensemble', () => {
    assert.equal(openTrainsLabel(0), 'aucun train ouvert');
    assert.equal(openTrainsLabel(1), '1 train ouvert');
    assert.equal(openTrainsLabel(2), '2 trains ouverts');
    assert.equal(openTrainsLabel(29), '29 trains ouverts');
  });
});
