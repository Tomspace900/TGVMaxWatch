import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExpired, pruneWatch } from '../src/watchlist.ts';

const CUTOFF = { date: '2026-09-07', time: '10:30' };

describe('isExpired', () => {
  it('retient un train a venir dans la journee', () => {
    assert.equal(isExpired({ date: '2026-09-07', after: '18:12' }, CUTOFF), false);
  });

  it('ecarte un train deja parti', () => {
    assert.equal(isExpired({ date: '2026-09-07', after: '07:12' }, CUTOFF), true);
  });

  it('ecarte une date passee, quelle que soit l heure', () => {
    assert.equal(isExpired({ date: '2026-09-06', after: '23:50' }, CUTOFF), true);
  });

  it('retient une date future, quelle que soit l heure', () => {
    assert.equal(isExpired({ date: '2026-09-08', after: '06:00' }, CUTOFF), false);
  });

  /*
   * Sans heure, l'entree porte la journee entiere : elle vit jusqu'au dernier
   * train. L'ecarter des le matin retirerait une surveillance encore utile.
   */
  it('garde une entree de journee entiere jusqu au soir', () => {
    assert.equal(isExpired({ date: '2026-09-07' }, CUTOFF), false);
    assert.equal(isExpired({ date: '2026-09-06' }, CUTOFF), true);
  });
});

describe('pruneWatch', () => {
  it('ne retire que ce qui est parti, et garde les regles', () => {
    const next = pruneWatch(
      {
        watch: [
          { date: '2026-09-06', after: '19:00' },
          { date: '2026-09-07', after: '07:12' },
          { date: '2026-09-07', after: '18:12' },
          { date: '2026-09-25', after: '07:12' },
        ],
        rules: [{ weekday: 'fri', after: '16:00' }],
      },
      CUTOFF,
    );
    assert.deepEqual(next.watch, [
      { date: '2026-09-07', after: '18:12' },
      { date: '2026-09-25', after: '07:12' },
    ]);
    assert.equal(next.rules.length, 1);
  });

  /* Rendre le meme objet evite un rendu et une ecriture pour rien. */
  it('rend la meme reference quand rien n a expire', () => {
    const watchlist = { watch: [{ date: '2026-09-25', after: '07:12' }], rules: [] };
    assert.equal(pruneWatch(watchlist, CUTOFF), watchlist);
  });
});
