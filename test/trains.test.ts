import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRAIN_TREND_DAYS } from '../src/config.ts';
import { createTrainsBuilder } from '../src/trains.ts';
import { BP, PB, departures, t } from './helpers.ts';

const TODAY = '2026-09-04';

describe('tendance par depart', () => {
  it('aligne la serie sur les dates de collecte', () => {
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', departures(t('2026-09-10', '8441', 'OUI')));
    builder.add('2026-09-02', departures(t('2026-09-10', '8441', 'NON')));
    builder.add('2026-09-03', departures(t('2026-09-10', '8441', 'OUI')));

    const trends = builder.finish();
    assert.deepEqual(trends.dates, ['2026-09-01', '2026-09-02', '2026-09-03']);
    // La cle est l'heure de depart : deux rames a la meme minute sont un seul
    // train, et deux frises pour un seul depart n'auraient jamais ete lues.
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['08:00'], 'ONO');
  });

  it('distingue un depart absent du dataset d un depart complet', () => {
    // Un train qui disparait n'est pas plein : il est supprime. Confondre les
    // deux ferait lire une saturation la ou il n'y a qu'un changement de plan
    // de transport.
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', departures(t('2026-09-10', '8441', 'OUI', '08:00')));
    builder.add('2026-09-02', departures(t('2026-09-10', '8443', 'OUI', '09:00')));
    builder.add('2026-09-03', departures(t('2026-09-10', '8441', 'NON', '08:00')));

    const serie = builder.finish().series[`2026-09-10|${PB}`];
    assert.equal(serie?.['08:00'], 'O-N');
    assert.equal(serie?.['09:00'], '-O-');
  });

  it('separe les deux sens', () => {
    const builder = createTrainsBuilder(TODAY);
    builder.add(
      '2026-09-01',
      departures(
        t('2026-09-10', '8441', 'OUI', '08:00', PB),
        t('2026-09-10', '8441', 'NON', '08:00', BP),
      ),
    );

    const trends = builder.finish();
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['08:00'], 'O');
    assert.equal(trends.series[`2026-09-10|${BP}`]?.['08:00'], 'N');
  });

  it('ecarte les dates de voyage deja passees', () => {
    // C'est cette borne qui empeche le fichier de grossir avec l'archive.
    const builder = createTrainsBuilder(TODAY);
    builder.add('2026-09-01', departures(t('2026-08-20', '8441', 'OUI')));

    assert.deepEqual(builder.finish().series, {});
  });

  it('ne garde que les dernieres dates de collecte', () => {
    const builder = createTrainsBuilder(TODAY);
    for (let i = 0; i < TRAIN_TREND_DAYS + 5; i++) {
      const day = `2026-07-${String(1 + i).padStart(2, '0')}`;
      builder.add(day, departures(t('2026-09-10', '8441', 'OUI')));
    }

    const trends = builder.finish();
    assert.equal(trends.dates.length, TRAIN_TREND_DAYS);
    assert.equal(trends.series[`2026-09-10|${PB}`]?.['08:00']?.length, TRAIN_TREND_DAYS);
  });
});
