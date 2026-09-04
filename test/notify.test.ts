import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNotification } from '../src/notify.ts';
import { durationTier } from '../src/duration.ts';
import { BP, PB } from './helpers.ts';
import type { DateSignal, TrainEvent } from '../src/types.ts';

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

function signal(
  kind: DateSignal['kind'],
  date: string,
  before: number,
  after: number,
  dir = PB,
): DateSignal {
  return { kind, date, dir, before, after };
}

describe('construction du message', () => {
  it('ne produit rien quand rien ne matche', () => {
    assert.equal(buildNotification([], []), null);
  });

  it('ne pousse pas les suppressions de train seules', () => {
    assert.equal(buildNotification([event('REMOVED', '2026-10-17', '8441')], []), null);
  });

  /*
   * L'alerte batie sur l'entree d'une date a J+30 exigeait qu'elle arrive avec
   * des places. Les quatre dates mesurees sont entrees a zero — 0/35, 0/39,
   * 0/33, 0/29 — et se sont remplies le lendemain : la condition n'etait jamais
   * vraie. C'est donc la transition qu'on regarde.
   */
  it('met le signal de date devant les evenements de train', () => {
    const notification = buildNotification(
      [event('OPEN', '2026-10-17', '8441')],
      [signal('REOPENED', '2026-11-16', 0, 10)],
    )!;

    assert.match(notification.title, /16\/11 Paris > Bordeaux rouvre : 10 trains/);
    assert.equal(notification.body.split('\n')[0], 'rouvre 16/11 Paris > Bordeaux : 10 places, 0 hier');
    assert.match(notification.url, /date=2026-11-16/);
  });

  it('nomme la date et le sens plutot qu un total', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2, BP)])!;
    assert.match(notification.title, /30\/09 Bordeaux > Paris : plus que 2 trains/);
  });

  it('accorde le singulier quand il ne reste qu une place', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 5, 1)])!;
    assert.match(notification.title, /plus que 1 train$/);
    assert.match(notification.body, /1 place, 5 hier/);
  });

  it('agrege le titre au-dela d un signal, sans perdre les lignes', () => {
    const notification = buildNotification(
      [],
      [signal('REOPENED', '2026-11-16', 0, 10), signal('REOPENED', '2026-11-17', 0, 7)],
    )!;

    assert.match(notification.title, /2 dates rouvrent/);
    assert.equal(notification.body.split('\n').length, 2);
  });

  it('porte l avant et l apres, pas seulement la variation', () => {
    // « 7 places parties » ne dit pas s'il en reste vingt ou deux, et c'est la
    // seule chose qui decide s'il faut ouvrir l'application maintenant.
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2)])!;
    assert.match(notification.body, /2 places, 9 hier/);
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
