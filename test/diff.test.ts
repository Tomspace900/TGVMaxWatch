import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffSnapshots } from '../src/diff.ts';
import { BP, PB, snapshot, t } from './helpers.ts';
import type { Availability, TrainRecord } from '../src/types.ts';

/** Cadre du diff. Toutes les dates de voyage des tests lui sont posterieures. */
const TODAY = '2026-10-01';

/** `n` trains d'une meme date et d'un meme sens, tous dans le meme etat. */
function fleet(date: string, count: number, availability: Availability, dir = PB): TrainRecord[] {
  return Array.from({ length: count }, (_, i) =>
    t(date, String(8000 + i), availability, `0${6 + (i % 4)}:00`, dir),
  );
}

describe('diff entre deux snapshots', () => {
  it('detecte une ouverture NON -> OUI', () => {
    const before = snapshot(t('2026-10-17', '8441', 'NON', '16:12'));
    const after = snapshot(t('2026-10-17', '8441', 'OUI', '16:12'));

    const { events } = diffSnapshots(before, after, TODAY);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, 'OPEN');
    assert.equal(events[0]?.trainNo, '8441');
  });

  it('detecte une fermeture OUI -> NON', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(t('2026-10-17', '8441', 'NON'));

    const { events } = diffSnapshots(before, after, TODAY);
    assert.equal(events[0]?.kind, 'CLOSE');
  });

  it('distingue un train supprime d un train complet', () => {
    // Le meme jour de voyage reste suivi, mais le train 8441 a disparu du plan
    // de transport : ce n'est pas une saturation.
    const before = snapshot(t('2026-10-17', '8441', 'OUI'), t('2026-10-17', '8443', 'OUI'));
    const after = snapshot(t('2026-10-17', '8443', 'OUI'));

    const { events } = diffSnapshots(before, after, TODAY);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, 'REMOVED');
    assert.equal(events[0]?.trainNo, '8441');
  });

  it('ne signale pas un train inchange', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'), t('2026-10-17', '8443', 'NON'));
    const { events } = diffSnapshots(before, before, TODAY);
    assert.deepEqual(events, []);
  });

  it('ne signale une cle nouvelle que si elle est reservable', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(
      t('2026-10-17', '8441', 'OUI'),
      t('2026-10-17', '8445', 'NON'),
      t('2026-10-17', '8447', 'OUI'),
    );

    const { events } = diffSnapshots(before, after, TODAY);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.trainNo, '8447');
  });

  it('traite les deux sens comme des trains distincts', () => {
    const before = snapshot(t('2026-10-17', '8441', 'NON', '08:00', PB));
    const after = snapshot(
      t('2026-10-17', '8441', 'NON', '08:00', PB),
      t('2026-10-17', '8441', 'OUI', '08:00', BP),
    );

    const { events } = diffSnapshots(before, after, TODAY);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.dir, BP);
  });
});

/*
 * Les seuils de ces regles viennent de l'archive reelle, pas d'une intuition :
 * notifier chaque train qui s'ouvre produisait 12 a 13 lignes par jour, ces
 * deux regles-la en donnent une a quatre.
 */
describe('signaux de date', () => {
  it('signale une date qui rouvre franchement', () => {
    const before = snapshot(...fleet('2026-10-17', 8, 'NON'));
    const after = snapshot(...fleet('2026-10-17', 8, 'OUI'));

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.equal(signals.length, 1);
    assert.deepEqual(signals[0], {
      kind: 'REOPENED',
      date: '2026-10-17',
      dir: PB,
      before: 0,
      after: 8,
    });
  });

  it('ignore une reouverture d une ou deux places', () => {
    // Une date entre a zero puis gagne une seule place : c'est le cas courant,
    // et il ne merite pas de deranger.
    const before = snapshot(...fleet('2026-10-17', 8, 'NON'));
    const after = snapshot(
      t('2026-10-17', '8000', 'OUI'),
      ...fleet('2026-10-17', 8, 'NON').slice(1),
    );

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('signale un creneau qui fond et dont il ne reste presque rien', () => {
    const before = snapshot(...fleet('2026-10-17', 9, 'OUI'));
    const after = snapshot(
      ...fleet('2026-10-17', 2, 'OUI'),
      ...fleet('2026-10-17', 9, 'NON').slice(2),
    );

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.kind, 'DRAINING');
    assert.equal(signals[0]?.before, 9);
    assert.equal(signals[0]?.after, 2);
  });

  it('ignore une fonte qui laisse de quoi choisir', () => {
    // 27 -> 20 est une grosse baisse, mais il reste vingt trains : rien
    // d'urgent. C'est le croisement vitesse/rarete qui fait l'information.
    const before = snapshot(...fleet('2026-10-17', 27, 'OUI'));
    const after = snapshot(
      ...fleet('2026-10-17', 20, 'OUI'),
      ...fleet('2026-10-17', 27, 'NON').slice(20),
    );

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('ne signale rien pour une date qui vient d entrer dans la fenetre', () => {
    // Les dates entrent a zero place — les quatre mesurees sont entrees a 0/35,
    // 0/39, 0/33 et 0/29. Il n'y a rien a annoncer avant le lendemain.
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(t('2026-10-17', '8441', 'OUI'), ...fleet('2026-11-16', 12, 'OUI'));

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('ignore une date de voyage deja passee', () => {
    const before = snapshot(...fleet('2026-09-20', 8, 'NON'));
    const after = snapshot(...fleet('2026-09-20', 8, 'OUI'));

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('classe les reouvertures avant les fontes', () => {
    const before = snapshot(...fleet('2026-10-17', 9, 'OUI'), ...fleet('2026-10-20', 8, 'NON', BP));
    const after = snapshot(
      ...fleet('2026-10-17', 2, 'OUI'),
      ...fleet('2026-10-17', 9, 'NON').slice(2),
      ...fleet('2026-10-20', 8, 'OUI', BP),
    );

    const { signals } = diffSnapshots(before, after, TODAY);
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.kind, 'REOPENED');
    assert.equal(signals[1]?.kind, 'DRAINING');
  });
});
