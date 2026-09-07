import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_PERIODS, periodOf } from '../src/periods.ts';
import { matchesWatchlist } from '../src/watchlist.ts';

describe('DAY_PERIODS', () => {
  /*
   * Le recouvrement d'une heure est le point de la table : sans lui, un depart
   * a 11h30 tombe entre deux periodes selon la facon dont on arrondit, et le
   * train qu'on cherchait ne declenche rien.
   */
  it('se recouvrent d une heure, sans trou', () => {
    for (let i = 1; i < DAY_PERIODS.length; i++) {
      const previous = DAY_PERIODS[i - 1]!;
      const current = DAY_PERIODS[i]!;
      assert.ok(
        current.after < previous.before,
        `${current.key} devrait commencer avant la fin de ${previous.key}`,
      );
    }
  });

  it('couvrent un depart de fin de matinee des deux cotes', () => {
    const watchlist = {
      watch: [{ date: '2026-09-12', dir: 'A>B', after: '05:00', before: '12:00' }],
      rules: [],
    };
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-09-12', dir: 'A>B', depart: '11:30' }),
      true,
    );
  });
});

describe('periodOf', () => {
  it('relit une fenetre connue', () => {
    assert.equal(periodOf('05:00', '12:00')?.key, 'matin');
    assert.equal(periodOf('19:00', '23:59')?.key, 'soir');
  });

  /* Une fenetre posee a la main n'est pas une periode : on affichera ses bornes. */
  it('ne devine rien sur une fenetre inconnue', () => {
    assert.equal(periodOf('07:12', '07:12'), null);
    assert.equal(periodOf(undefined, undefined), null);
    assert.equal(periodOf('05:00', undefined), null);
  });
});
