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

    assert.match(notification.title, /lun 16\/11 Paris → Bordeaux rouvre : 10 trains/);
    assert.equal(notification.body.split('\n')[0], '🟢 rouvre lun 16/11 Paris → Bordeaux : 10 trains, 0 hier');
    assert.match(notification.url, /date=2026-11-16/);
  });

  it('nomme la date et le sens plutot qu un total', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2, BP)])!;
    assert.match(notification.title, /mer 30\/09 Bordeaux → Paris : plus que 2 trains/);
  });

  it('accorde le singulier quand il ne reste qu un train', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 5, 1)])!;
    assert.match(notification.title, /plus que 1 train$/);
    assert.match(notification.body, /1 train, 5 hier/);
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
    // « 7 trains partis » ne dit pas s'il en reste vingt ou deux, et c'est la
    // seule chose qui decide s'il faut ouvrir l'application maintenant.
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2)])!;
    assert.match(notification.body, /2 trains, 9 hier/);
  });

  it('regroupe une meme date et un meme sens sur une seule ligne', () => {
    const events = ['08:11', '10:11', '12:46', '14:46', '16:15', '19:11'].map((depart) =>
      event('OPEN', '2026-10-17', '8441', depart),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');

    assert.equal(lines.length, 1);
    assert.equal(lines[0], '🟢 sam 17/10 Paris → Bordeaux 08:11 10:11 12:46 14:46 +2');
  });

  /*
   * Le sens etait la seule information absente des lignes d'ouverture, et la
   * seule qu'on ne puisse pas deviner : « 57 trains ouverts » ne dit pas s'il
   * s'agit de l'aller ou du retour.
   */
  it('porte le sens sur chaque ligne', () => {
    const notification = buildNotification([event('OPEN', '2026-10-17', '8441')], [])!;
    assert.match(notification.body, /Paris → Bordeaux/);
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

    assert.equal(notification.body, '🟢 sam 17/10 Paris → Bordeaux 10:41 12:46');
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

/*
 * Un creneau suivi est la seule ligne d'un message dont on sait qu'elle a ete
 * demandee. Elle passe donc avant les alertes universelles, et prend le titre.
 */
describe('buildNotification, creneaux suivis', () => {
  const slot = {
    kind: 'SLOT_OPENED' as const,
    date: '2026-09-17',
    dir: PB,
    after: '05:00',
    before: '12:00',
    label: 'matin',
    before_count: 0,
    after_count: 3,
  };

  it('nomme le creneau par son mot, avec l avant et l apres', () => {
    const notification = buildNotification([], [], [slot])!;
    assert.equal(
      notification.body.split('\n')[0],
      '🟢 ouvre jeu 17/09 Paris → Bordeaux matin : 3 trains, 0 hier',
    );
  });

  it('prend le titre, meme en presence d une alerte generale', () => {
    const general: DateSignal = {
      kind: 'REOPENED',
      date: '2026-09-20',
      dir: BP,
      before: 0,
      after: 12,
    };
    const notification = buildNotification([], [general], [slot])!;
    assert.equal(notification.title, 'jeu 17/09 Paris → Bordeaux matin : 3 trains');
    assert.match(notification.body.split('\n')[0]!, /^🟢 ouvre jeu 17\/09/);
  });

  it('absorbe les trains qui ont ouvert le creneau', () => {
    // Le 07:12 est dans le matin, le 19:04 non : seul le second reste visible.
    const inside = event('OPEN', '2026-09-17', '8441', '07:12');
    const outside = event('OPEN', '2026-09-17', '8999', '19:04');
    const notification = buildNotification([inside, outside], [], [slot])!;

    assert.equal(notification.body.includes('07:12'), false);
    assert.equal(notification.body.includes('19:04'), true);
  });

  it('pointe le lien sur le creneau, pas sur autre chose', () => {
    const notification = buildNotification([], [], [slot])!;
    assert.match(notification.url, /date=2026-09-17/);
  });
});

describe('lisibilite du message', () => {
  /*
   * Le message est lu sur un ecran verrouille, entre deux autres notifications,
   * en une seconde. Ces trois assertions portent sur ce qui se lit dans cette
   * seconde-la, et rien d'autre.
   */
  it('donne le jour de la semaine, pas seulement la date', () => {
    const notification = buildNotification([event('OPEN', '2026-09-14', '8401')], [])!;
    // « le 14 » ne decide rien : c'est « lundi » qui dit si le voyage est possible.
    assert.match(notification.body, /lun 14\/09/);
    assert.match(notification.title, /1 train ouvert/);
  });

  it('remplace « parti » par une marque, au lieu de repeter le titre', () => {
    const notification = buildNotification([event('CLOSE', '2026-09-14', '8401')], [])!;

    // Le titre disait deja « parti », la ligne le redisait : la marque prend sa
    // place plutot que de s'y ajouter.
    assert.match(notification.title, /1 train parti/);
    assert.equal(notification.body.includes('parti'), false);
    assert.match(notification.body, /^⚫ lun 14\/09/);
  });

  it('distingue ce qui monte de ce qui baisse, sans retirer le mot', () => {
    const notification = buildNotification(
      [],
      [signal('REOPENED', '2026-09-14', 0, 8), signal('DRAINING', '2026-09-15', 9, 2, BP)],
    )!;
    const [up = '', down = ''] = notification.body.split('\n');

    assert.match(up, /^🟢 rouvre /);
    assert.match(down, /^🟠 se vide /);
    // La marque accelere, elle ne remplace pas : vert et orange se ressemblent
    // en deuteranopie, « rouvre » et « se vide » non.
    assert.equal(up.includes('rouvre'), true);
    assert.equal(down.includes('se vide'), true);
  });

  it('ne met aucune marque dans le titre', () => {
    const notification = buildNotification([], [signal('REOPENED', '2026-09-14', 0, 8)])!;
    // Un signal pose partout redevient un fond, et l'icone est deja a cote.
    assert.equal(/[🟢🟠⚫]/u.test(notification.title), false);
  });
});
