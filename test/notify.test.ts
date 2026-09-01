import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNotification } from '../src/notify.ts';
import { durationTier } from '../src/duration.ts';
import { PB } from './helpers.ts';
import type { TrainEvent } from '../src/types.ts';

function event(kind: TrainEvent['kind'], date: string, trainNo: string, depart = '16:12'): TrainEvent {
  return {
    kind,
    date,
    dir: PB,
    trainNo,
    depart,
    arrivee: '18:26',
    durationMin: 134,
    tier: durationTier(134),
  };
}

describe('construction du message', () => {
  it('ne produit rien quand rien ne matche', () => {
    assert.equal(buildNotification([], []), null);
  });

  it('ne pousse pas les suppressions de train seules', () => {
    assert.equal(buildNotification([event('REMOVED', '2026-10-17', '8441')], []), null);
  });

  it('met la date entrante en avant, c est le signal a plus fort rendement', () => {
    const notification = buildNotification(
      [event('OPEN', '2026-10-17', '8441')],
      [{ date: '2026-11-16', dir: PB, oui: 12, total: 36 }],
    );

    assert.match(notification!.title, /J\+30|Nouvelle date/);
    assert.match(notification!.body, /16\/11/);
    assert.match(notification!.url, /date=2026-11-16/);
  });

  it('groupe tout dans un seul message et tronque au-dela de six lignes', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event('OPEN', '2026-10-17', String(8000 + i)),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');
    assert.equal(lines.length, 7);
    assert.equal(lines.at(-1), '+4 autres');
  });

  it('signale un train long dans le corps du message', () => {
    const long: TrainEvent = { ...event('OPEN', '2026-10-17', '8441'), durationMin: 210, tier: 'long' };
    const notification = buildNotification([long], [])!;
    assert.match(notification.body, /3h30 \(long\)/);
  });

  it('reste sous la limite de payload du service push', () => {
    const events = Array.from({ length: 400 }, (_, i) =>
      event('OPEN', '2026-10-17', String(8000 + i)),
    );
    const notification = buildNotification(events, [])!;
    assert.ok(Buffer.byteLength(JSON.stringify(notification)) < 4096);
  });
});
