import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStatsBuilder, median, slotOf } from '../src/stats.ts';
import { MIN_SNAPSHOTS_FOR_STATS } from '../src/config.ts';
import { PB, snapshot, t } from './helpers.ts';
import type { Availability } from '../src/types.ts';

describe('statistiques derivees', () => {
  it('arrondit la tranche horaire a deux heures', () => {
    assert.equal(slotOf('06:06'), '06');
    assert.equal(slotOf('07:59'), '06');
    assert.equal(slotOf('16:12'), '16');
    assert.equal(slotOf('00:10'), '00');
  });

  it('calcule une mediane sur un nombre pair et impair de valeurs', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
  });

  it('ne publie aucune prevision sous le seuil d echantillon', () => {
    const builder = createStatsBuilder('2026-09-01');
    builder.add('2026-08-01', snapshot(t('2026-08-15', '8441', 'OUI')));

    const stats = builder.finish('2026-09-01', 3);
    assert.equal(stats.ready, false);
    assert.deepEqual(stats.burnRate, []);
    assert.deepEqual(stats.reopen, {});
    assert.deepEqual(stats.erosion, []);
  });

  it('mesure le delai entre l entree dans la fenetre et la fermeture', () => {
    const builder = createStatsBuilder('2026-11-01');

    // Trois vendredis de 16h, chacun ouvert a J+30 puis ferme quatre jours plus tard.
    const cases = [
      { travel: '2026-09-04', open: '2026-08-05', close: '2026-08-09' },
      { travel: '2026-09-11', open: '2026-08-12', close: '2026-08-16' },
      { travel: '2026-09-18', open: '2026-08-19', close: '2026-08-23' },
    ];

    for (const { travel, open, close } of cases) {
      for (const [day, availability] of [
        [open, 'OUI'],
        [close, 'NON'],
      ] as [string, Availability][]) {
        builder.add(day, snapshot(t(travel, '8441', availability, '16:12', PB)));
      }
    }

    const stats = builder.finish('2026-11-01', MIN_SNAPSHOTS_FOR_STATS);
    assert.equal(stats.ready, true);

    const friday16h = stats.burnRate.find((row) => row.weekday === 5 && row.slot === '16');
    assert.equal(friday16h?.medianDays, 4);
    assert.equal(friday16h?.sample, 3);
  });

  it('ne compte pas une date de voyage encore a venir', () => {
    const builder = createStatsBuilder('2026-09-01');
    builder.add('2026-08-05', snapshot(t('2026-09-04', '8441', 'OUI', '16:12')));
    builder.add('2026-08-09', snapshot(t('2026-09-04', '8441', 'NON', '16:12')));

    // Le 2026-09-04 est posterieur au « aujourd'hui » passe a finish : la mesure
    // serait censuree, on l'ecarte.
    const stats = builder.finish('2026-09-01', MIN_SNAPSHOTS_FOR_STATS);
    assert.deepEqual(stats.burnRate, []);
  });

  it('mesure le taux de reouverture par numero de train', () => {
    const builder = createStatsBuilder('2026-11-01');

    // Cinq instances du train 8441 : trois ferment puis rouvrent, deux restent fermees.
    const sequences: Availability[][] = [
      ['OUI', 'NON', 'OUI'],
      ['OUI', 'NON', 'OUI'],
      ['OUI', 'NON', 'OUI'],
      ['OUI', 'NON', 'NON'],
      ['OUI', 'NON', 'NON'],
    ];

    sequences.forEach((sequence, index) => {
      const travel = `2026-09-${String(10 + index).padStart(2, '0')}`;
      sequence.forEach((availability, step) => {
        builder.add(`2026-08-${String(10 + step).padStart(2, '0')}`, [
          t(travel, '8441', availability, '16:12'),
        ]);
      });
    });

    const stats = builder.finish('2026-11-01', MIN_SNAPSHOTS_FOR_STATS);
    assert.equal(stats.reopen['8441']?.closed, 5);
    assert.equal(stats.reopen['8441']?.reopened, 3);
    assert.equal(stats.reopen['8441']?.rate, 0.6);
  });
});
