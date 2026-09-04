import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRAIN_TREND_DAYS } from '../src/config.ts';
import { createTrainsBuilder } from '../src/trains.ts';
import { BP, PB, snapshot, t } from './helpers.ts';

const TODAY = '2026-09-04';

describe('tendance par train', () => {
  it('aligne la serie sur les dates de collecte', () => {
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', snapshot(t('2026-09-10', '8441', 'OUI')));
    builder.add('2026-09-02', snapshot(t('2026-09-10', '8441', 'NON')));
    builder.add('2026-09-03', snapshot(t('2026-09-10', '8441', 'OUI')));

    const trends = builder.finish();
    assert.deepEqual(trends.dates, ['2026-09-01', '2026-09-02', '2026-09-03']);
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['8441'], 'ONO');
  });

  it('distingue un train absent du dataset d un train complet', () => {
    // Un train qui disparait n'est pas plein : il est supprime. Confondre les
    // deux ferait lire une saturation la ou il n'y a qu'un changement de plan
    // de transport.
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', snapshot(t('2026-09-10', '8441', 'OUI')));
    builder.add('2026-09-02', snapshot(t('2026-09-10', '8443', 'OUI')));
    builder.add('2026-09-03', snapshot(t('2026-09-10', '8441', 'NON')));

    const serie = builder.finish().series[`2026-09-10|${PB}`];
    assert.equal(serie?.['8441'], 'O-N');
    assert.equal(serie?.['8443'], '-O-');
  });

  it('separe les deux sens', () => {
    const builder = createTrainsBuilder(TODAY);
    builder.add(
      '2026-09-01',
      snapshot(
        t('2026-09-10', '8441', 'OUI', '08:00', PB),
        t('2026-09-10', '8441', 'NON', '08:00', BP),
      ),
    );

    const trends = builder.finish();
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['8441'], 'O');
    assert.equal(trends.series[`2026-09-10|${BP}`]?.['8441'], 'N');
  });

  it('ecarte les dates de voyage deja passees', () => {
    // C'est cette borne qui empeche le fichier de grossir avec l'archive.
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', snapshot(t('2026-08-20', '8441', 'OUI')));

    assert.deepEqual(builder.finish().series, {});
  });

  it('ne garde que les dernieres dates de collecte', () => {
    const builder = createTrainsBuilder(TODAY);
    for (let i = 0; i < TRAIN_TREND_DAYS + 5; i++) {
      const day = `2026-07-${String(1 + i).padStart(2, '0')}`;
      builder.add(day, snapshot(t('2026-09-10', '8441', 'OUI')));
    }

    const trends = builder.finish();
    assert.equal(trends.dates.length, TRAIN_TREND_DAYS);
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['8441']?.length, TRAIN_TREND_DAYS);
  });
});
