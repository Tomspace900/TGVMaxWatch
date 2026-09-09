import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookableTrainNo, foldDepartures } from '../src/departures.ts';
import { PB, snapshot, t } from './helpers.ts';

describe('foldDepartures', () => {
  it('replie deux rames d un meme depart en une seule ligne', () => {
    const departures = foldDepartures(
      snapshot(t('2026-09-19', '8503', 'NON', '06:37'), t('2026-09-19', '8571', 'NON', '06:37')),
    );
    assert.equal(departures.length, 1);
    assert.deepEqual(departures[0]!.trainNos, ['8503', '8571']);
  });

  /*
   * Le cas qui empeche de compter naivement : le depart est reservable, mais
   * sur une rame precise. 53 departs sont dans ce cas sur un snapshot.
   */
  it('reste ouvert quand une seule des deux rames l est', () => {
    const departures = foldDepartures(
      snapshot(t('2026-09-19', '8473', 'OUI', '10:41'), t('2026-09-19', '8505', 'NON', '10:41')),
    );
    assert.equal(departures[0]!.available, true);
    assert.deepEqual(departures[0]!.openTrainNos, ['8473']);
    assert.deepEqual(departures[0]!.trainNos, ['8473', '8505']);
  });

  it('reste complet quand aucune rame ne l est', () => {
    const departures = foldDepartures(
      snapshot(t('2026-09-19', '8473', 'NON', '10:41'), t('2026-09-19', '8505', 'NON', '10:41')),
    );
    assert.equal(departures[0]!.available, false);
    assert.deepEqual(departures[0]!.openTrainNos, []);
  });

  it('ne replie pas deux departs a des minutes differentes', () => {
    const departures = foldDepartures(
      snapshot(t('2026-09-19', '8473', 'OUI', '10:41'), t('2026-09-19', '8505', 'OUI', '10:44')),
    );
    assert.equal(departures.length, 2);
  });

  it('ne replie pas la meme minute dans deux sens', () => {
    const departures = foldDepartures(
      snapshot(
        t('2026-09-19', '8473', 'OUI', '10:41'),
        t('2026-09-19', '9999', 'OUI', '10:41', 'FRBOJ>FRPMO'),
      ),
    );
    assert.equal(departures.length, 2);
  });

  it('rend un ordre stable, date puis sens puis heure', () => {
    const departures = foldDepartures(
      snapshot(
        t('2026-09-20', '1', 'OUI', '08:00'),
        t('2026-09-19', '2', 'OUI', '18:00'),
        t('2026-09-19', '3', 'OUI', '06:00'),
      ),
    );
    assert.deepEqual(
      departures.map((departure) => `${departure.date} ${departure.depart}`),
      ['2026-09-19 06:00', '2026-09-19 18:00', '2026-09-20 08:00'],
    );
  });
});

describe('bookableTrainNo', () => {
  /* On reserve la rame ouverte, pas la premiere venue. */
  it('retient une rame ouverte quand les deux divergent', () => {
    const [departure] = foldDepartures(
      snapshot(t('2026-09-19', '8505', 'NON', '10:41'), t('2026-09-19', '8473', 'OUI', '10:41')),
    );
    assert.equal(bookableTrainNo(departure!), '8473');
  });

  it('retombe sur la premiere rame quand le depart est complet', () => {
    const [departure] = foldDepartures(snapshot(t('2026-09-19', '8505', 'NON', '10:41')));
    assert.equal(bookableTrainNo(departure!), '8505');
  });
});

describe('trainNos', () => {
  /*
   * Une reservation est enregistree sur une rame, et les ecrans reconnaissent
   * un depart reserve en cherchant dans `trainNos`. Toutes les rames doivent
   * donc y figurer, ouvertes ou non : sinon le badge « reserve » disparait des
   * que la source ferme la rame sur laquelle la reservation a ete posee.
   */
  it('porte toutes les rames du depart, ouvertes ou non', () => {
    const [departure] = foldDepartures(
      snapshot(t('2026-09-19', '8473', 'OUI', '10:41'), t('2026-09-19', '8505', 'NON', '10:41')),
    );
    assert.deepEqual(departure?.trainNos, ['8473', '8505']);
    assert.deepEqual(departure?.openTrainNos, ['8473']);
  });
});

/* Le sens est bien celui du dataset, pas une valeur par defaut. */
describe('foldDepartures, sens', () => {
  it('porte le sens de la ligne', () => {
    const [departure] = foldDepartures(snapshot(t('2026-09-19', '8473', 'OUI', '10:41')));
    assert.equal(departure!.dir, PB);
  });
});
