import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  covers,
  hasWatch,
  parseWatchlist,
  pruneWatch,
  setWatch,
  stamp,
  watchDays,
} from '../src/watchlist.ts';
import type { Watch } from '../src/types.ts';
import { BP, PB } from './helpers.ts';

const RETOUR: Watch = { dir: BP, from: '2026-09-24 18:00', to: '2026-09-25 11:00' };
const depart = (date: string, time: string, tier: 'direct' | 'long' = 'direct', dir = BP) => ({
  date,
  dir,
  depart: time,
  tier,
});

describe('covers', () => {
  it('prend les deux jours d une fenetre qui passe la nuit, bornes incluses', () => {
    assert.equal(covers(RETOUR, depart('2026-09-24', '18:00')), true);
    assert.equal(covers(RETOUR, depart('2026-09-24', '23:30')), true);
    assert.equal(covers(RETOUR, depart('2026-09-25', '06:04')), true);
    assert.equal(covers(RETOUR, depart('2026-09-25', '11:00')), true);
  });

  it('laisse dehors ce qui est avant, apres, ou dans l autre sens', () => {
    assert.equal(covers(RETOUR, depart('2026-09-24', '17:59')), false);
    assert.equal(covers(RETOUR, depart('2026-09-25', '11:01')), false);
    assert.equal(covers(RETOUR, depart('2026-09-24', '19:00', 'direct', PB)), false);
  });

  it('ecarte un trajet long seulement quand on l a demande', () => {
    assert.equal(covers(RETOUR, depart('2026-09-24', '19:00', 'long')), true);
    assert.equal(covers({ ...RETOUR, skipLong: true }, depart('2026-09-24', '19:00', 'long')), false);
  });
});

describe('watchDays', () => {
  it('marque les deux jours d une fenetre qui passe la nuit', () => {
    assert.deepEqual(watchDays(RETOUR), ['2026-09-24', '2026-09-25']);
  });

  it('un train seul ne marque que son jour', () => {
    assert.deepEqual(watchDays({ dir: BP, from: '2026-09-24 18:11', to: '2026-09-24 18:11' }), ['2026-09-24']);
  });

  it('traverse une fin de mois', () => {
    assert.deepEqual(watchDays({ dir: BP, from: '2026-09-30 18:00', to: '2026-10-02 11:00' }), [
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('gestes sur la liste', () => {
  it('compare par valeur, pas par identite d objet', () => {
    // L'objet vient d'un autre rendu : c'est ce qu'un rafraichissement produit.
    const jumeau = { ...RETOUR };
    assert.equal(hasWatch([RETOUR], jumeau), true);
    assert.deepEqual(setWatch([RETOUR], jumeau, false), []);
  });

  it('ne double jamais un suivi deja pose', () => {
    assert.equal(setWatch(setWatch([], RETOUR, true), { ...RETOUR }, true).length, 1);
  });

  it('distingue la meme fenetre avec ou sans les trajets longs', () => {
    assert.equal(hasWatch([RETOUR], { ...RETOUR, skipLong: true }), false);
  });
});

describe('pruneWatch', () => {
  it('garde une fenetre tant que sa fin n est pas passee', () => {
    assert.deepEqual(pruneWatch([RETOUR], stamp('2026-09-25', '10:00')), [RETOUR]);
    assert.deepEqual(pruneWatch([RETOUR], stamp('2026-09-25', '11:01')), []);
  });

  it('rend la meme reference quand rien n a expire', () => {
    const list = [RETOUR];
    assert.equal(pruneWatch(list, stamp('2026-09-20', '00:00')), list);
  });
});

describe('parseWatchlist', () => {
  it('refuse ce qui n est pas une liste, et ecarte les entrees incompletes', () => {
    assert.equal(parseWatchlist({ watch: [], rules: [] }), null);
    assert.deepEqual(parseWatchlist([RETOUR, { dir: BP }, { ...RETOUR, from: '2026-09-26 00:00' }]), [
      RETOUR,
    ]);
  });
});
