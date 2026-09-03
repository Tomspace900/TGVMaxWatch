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

  it('ignore une date entrante sans une seule place', () => {
    assert.equal(
      buildNotification([], [{ date: '2026-10-03', dir: PB, oui: 0, total: 62 }]),
      null,
    );
  });

  /*
   * Le cas qui a motive le filtre. Le 2026-10-03 est entre dans l'horizon avec
   * soixante-deux trains tous complets, le meme jour que 244 ouvertures : le
   * titre des dates entrantes etant prioritaire, le message aurait annonce
   * « 0 train » et masque tout le reste.
   */
  it('une date entrante vide ne masque pas les ouvertures du meme run', () => {
    const notification = buildNotification(
      [event('OPEN', '2026-10-17', '8441'), event('OPEN', '2026-10-18', '8442')],
      [{ date: '2026-10-03', dir: PB, oui: 0, total: 62 }],
    );

    assert.match(notification!.title, /2 places ouvertes/);
    assert.doesNotMatch(notification!.body, /03\/10/);
    assert.match(notification!.url, /date=2026-10-17/);
  });

  it('garde les dates entrantes qui ont des places, et ecarte les vides', () => {
    const notification = buildNotification(
      [],
      [
        { date: '2026-10-03', dir: PB, oui: 0, total: 62 },
        { date: '2026-10-04', dir: PB, oui: 7, total: 40 },
      ],
    );

    assert.match(notification!.title, /Nouvelle date a J\+30 : 7 trains/);
    assert.doesNotMatch(notification!.body, /03\/10/);
    assert.match(notification!.url, /date=2026-10-04/);
  });

  it('regroupe une meme date et un meme sens sur une seule ligne', () => {
    const events = ['08:11', '10:11', '12:46', '14:46', '16:15', '19:11'].map((depart) =>
      event('OPEN', '2026-10-17', '8441', depart),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');

    assert.equal(lines.length, 1);
    assert.equal(lines[0], '17/10 Paris > Bordeaux 08:11 10:11 12:46 14:46 +2');
  });

  /*
   * Le sens etait la seule information absente des lignes d'ouverture, et la
   * seule qu'on ne puisse pas deviner : « 57 places ouvertes » ne dit pas s'il
   * s'agit de l'aller ou du retour.
   */
  it('porte le sens sur chaque ligne', () => {
    const notification = buildNotification([event('OPEN', '2026-10-17', '8441')], [])!;
    assert.match(notification.body, /Paris > Bordeaux/);
  });

  it('ne repete pas un horaire partage par deux trains', () => {
    const notification = buildNotification(
      [
        event('OPEN', '2026-10-17', '8473', '10:41'),
        event('OPEN', '2026-10-17', '8505', '10:41'),
        event('OPEN', '2026-10-17', '8441', '12:46'),
      ],
      [],
    )!;

    assert.equal(notification.body, '17/10 Paris > Bordeaux 10:41 12:46');
  });

  it('tronque au-dela de six lignes', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event('OPEN', `2026-10-${String(10 + i)}`, String(8000 + i)),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');
    assert.equal(lines.length, 7);
    assert.equal(lines.at(-1), '+4 autres');
  });

  it('signale un train long dans le corps du message', () => {
    const long: TrainEvent = { ...event('OPEN', '2026-10-17', '8441'), durationMin: 210, tier: 'long' };
    const notification = buildNotification([long], [])!;
    assert.match(notification.body, /16:12 \(3h30\)/);
  });

  it('reste sous la limite de payload du service push', () => {
    const events = Array.from({ length: 400 }, (_, i) =>
      event('OPEN', '2026-10-17', String(8000 + i)),
    );
    const notification = buildNotification(events, [])!;
    assert.ok(Buffer.byteLength(JSON.stringify(notification)) < 4096);
  });
});
