import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffSnapshots } from '../src/diff.ts';
import { BP, PB, snapshot, t } from './helpers.ts';

describe('diff entre deux snapshots', () => {
  it('detecte une ouverture NON -> OUI', () => {
    const before = snapshot(t('2026-10-17', '8441', 'NON', '16:12'));
    const after = snapshot(t('2026-10-17', '8441', 'OUI', '16:12'));

    const { events } = diffSnapshots(before, after);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, 'OPEN');
    assert.equal(events[0]?.trainNo, '8441');
  });

  it('detecte une fermeture OUI -> NON', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(t('2026-10-17', '8441', 'NON'));

    const { events } = diffSnapshots(before, after);
    assert.equal(events[0]?.kind, 'CLOSE');
  });

  it('distingue un train supprime d un train complet', () => {
    // Le meme jour de voyage reste suivi, mais le train 8441 a disparu du plan
    // de transport : ce n'est pas une saturation.
    const before = snapshot(t('2026-10-17', '8441', 'OUI'), t('2026-10-17', '8443', 'OUI'));
    const after = snapshot(t('2026-10-17', '8443', 'OUI'));

    const { events } = diffSnapshots(before, after);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, 'REMOVED');
    assert.equal(events[0]?.trainNo, '8441');
  });

  it('ne signale pas un train inchange', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'), t('2026-10-17', '8443', 'NON'));
    const { events } = diffSnapshots(before, before);
    assert.deepEqual(events, []);
  });

  it('ne signale une cle nouvelle que si elle est reservable', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(
      t('2026-10-17', '8441', 'OUI'),
      t('2026-10-17', '8445', 'NON'),
      t('2026-10-17', '8447', 'OUI'),
    );

    const { events } = diffSnapshots(before, after);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.trainNo, '8447');
  });

  it('traite les deux sens comme des trains distincts', () => {
    const before = snapshot(t('2026-10-17', '8441', 'NON', '08:00', PB));
    const after = snapshot(
      t('2026-10-17', '8441', 'NON', '08:00', PB),
      t('2026-10-17', '8441', 'OUI', '08:00', BP),
    );

    const { events } = diffSnapshots(before, after);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.dir, BP);
  });

  it('detecte une date entrant dans la fenetre, par sens', () => {
    const before = snapshot(t('2026-10-17', '8441', 'OUI'));
    const after = snapshot(
      t('2026-10-17', '8441', 'OUI'),
      t('2026-11-16', '8501', 'OUI', '07:00', PB),
      t('2026-11-16', '8503', 'NON', '09:00', PB),
      t('2026-11-16', '8601', 'OUI', '18:00', BP),
    );

    const { newDates } = diffSnapshots(before, after);
    assert.equal(newDates.length, 2);
    assert.deepEqual(newDates[0], { date: '2026-11-16', dir: BP, oui: 1, total: 1 });
    assert.deepEqual(newDates[1], { date: '2026-11-16', dir: PB, oui: 1, total: 2 });
  });

  it('ne considere pas une date deja connue comme entrante', () => {
    const before = snapshot(t('2026-11-16', '8501', 'NON'));
    const after = snapshot(t('2026-11-16', '8501', 'OUI'), t('2026-11-16', '8503', 'OUI'));

    const { newDates, events } = diffSnapshots(before, after);
    assert.deepEqual(newDates, []);
    assert.equal(events.length, 2);
  });
});
