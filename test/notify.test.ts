import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNotification } from '../src/notify.ts';
import { durationTier } from '../src/duration.ts';
import { diffSnapshots } from '../src/diff.ts';
import { BP, PB, departures, t } from './helpers.ts';
import type { DateSignal, TrainEvent } from '../src/types.ts';

function event(kind: TrainEvent['kind'], date: string, trainNo: string, depart = '16:12'): TrainEvent {
  return {
    kind,
    date,
    dir: PB,
    trainNos: [trainNo],
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
    const [heading, first] = notification.body.split('\n');
    assert.equal(heading, 'Paris → Bordeaux');
    assert.equal(first, '🟢 rouvre lun 16/11 : 0 → 10 trains');
    assert.match(notification.url, /date=2026-11-16/);
  });

  it('nomme la date et le sens plutot qu un total', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2, BP)])!;
    assert.match(notification.title, /mer 30\/09 Bordeaux → Paris : plus que 2 trains/);
  });

  it('accorde le singulier quand il ne reste qu un train', () => {
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 5, 1)])!;
    assert.match(notification.title, /plus que 1 train$/);
    assert.match(notification.body, /5 → 1 train/);
  });

  it('agrege le titre au-dela d un signal, sans perdre les lignes', () => {
    const notification = buildNotification(
      [],
      [signal('REOPENED', '2026-11-16', 0, 10), signal('REOPENED', '2026-11-17', 0, 7)],
    )!;

    assert.match(notification.title, /2 dates rouvrent/);
    // Deux lignes de detail, et un seul en-tete : les deux partagent le sens.
    assert.deepEqual(notification.body.split('\n'), [
      'Paris → Bordeaux',
      '🟢 rouvre lun 16/11 : 0 → 10 trains',
      '🟢 rouvre mar 17/11 : 0 → 7 trains',
    ]);
  });

  it('porte l avant et l apres, pas seulement la variation', () => {
    // « 7 trains partis » ne dit pas s'il en reste vingt ou deux, et c'est la
    // seule chose qui decide s'il faut ouvrir l'application maintenant.
    const notification = buildNotification([], [signal('DRAINING', '2026-09-30', 9, 2)])!;
    assert.match(notification.body, /9 → 2 trains/);
  });

  it('regroupe une meme date et un meme sens sur une seule ligne', () => {
    const events = ['08:11', '10:11', '12:46', '14:46', '16:15', '19:11'].map((depart) =>
      event('OPEN', '2026-10-17', '8441', depart),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');

    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'Paris → Bordeaux');
    assert.equal(lines[1], '🟢 sam 17/10 08:11 10:11 12:46 14:46 +2');
  });

  /*
   * Le sens reste la seule information qu'on ne puisse pas deviner — « 57
   * trains ouverts » ne dit pas s'il s'agit de l'aller ou du retour — mais il
   * s'ecrit une fois, en sous-titre, au lieu d'occuper la moitie de chaque
   * ligne et de les faire toutes se replier.
   */
  it('ecrit le sens une fois, en en-tete', () => {
    const notification = buildNotification(
      [event('OPEN', '2026-10-17', '8441'), event('OPEN', '2026-10-18', '8443')],
      [],
    )!;

    const lines = notification.body.split('\n');
    assert.equal(lines.filter((line) => line === 'Paris → Bordeaux').length, 1);
    assert.equal(lines[0], 'Paris → Bordeaux');
    assert.equal(lines[1]?.includes('Bordeaux'), false);
  });

  it('reecrit le sens des qu il change, sans casser l ordre de priorite', () => {
    const notification = buildNotification(
      [event('OPEN', '2026-10-17', '8441')],
      [signal('DRAINING', '2026-09-30', 9, 2, BP)],
    )!;

    // Le signal passe devant l'evenement de train, donc le sens change en
    // cours de route : l'en-tete se reecrit plutot que de regrouper.
    assert.deepEqual(notification.body.split('\n'), [
      'Bordeaux → Paris',
      '🟠 se vide mer 30/09 : 9 → 2 trains',
      'Paris → Bordeaux',
      '🟢 sam 17/10 16:12',
    ]);
  });

  /*
   * Deux rames a la meme minute — le 06/09, les 8473 et 8505 partent a 10:41 —
   * donnaient deux evenements, et la ligne repetait « 10:41 10:41 ». Le repli
   * en departs supprime le doublon a la source : le message n'a plus rien a
   * dedupliquer, et c'est le diff qu'on verifie ici, pas une liste fabriquee a
   * la main que le collecteur ne peut plus produire.
   */
  it('ne repete pas un horaire partage par deux rames', () => {
    const before = departures(
      t('2026-10-17', '8473', 'NON', '10:41'),
      t('2026-10-17', '8505', 'NON', '10:41'),
      t('2026-10-17', '8441', 'NON', '12:46'),
    );
    const after = departures(
      t('2026-10-17', '8473', 'OUI', '10:41'),
      t('2026-10-17', '8505', 'OUI', '10:41'),
      t('2026-10-17', '8441', 'OUI', '12:46'),
    );

    const { events } = diffSnapshots(before, after, '2026-10-01');
    assert.equal(events.length, 2);

    const notification = buildNotification(events, [])!;
    assert.equal(notification.body, 'Paris → Bordeaux\n🟢 sam 17/10 10:41 12:46');
  });

  it('tronque au-dela de six lignes', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event('OPEN', `2026-10-${String(10 + i)}`, String(8000 + i)),
    );

    const notification = buildNotification(events, [])!;
    const lines = notification.body.split('\n');
    // Six lignes de detail, plus l'en-tete de sens, plus le reste annonce :
    // l'en-tete ne consomme pas le budget de detail, il le nomme.
    assert.equal(lines.length, 8);
    assert.equal(lines[0], 'Paris → Bordeaux');
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
    assert.deepEqual(
      notification.body.split('\n').slice(0, 2),
      ['Paris → Bordeaux', '🟢 ouvre jeu 17/09 matin : 0 → 3 trains'],
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
    assert.match(notification.body.split('\n')[1]!, /^🟢 ouvre jeu 17\/09/);
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
    assert.match(notification.body, /^Paris → Bordeaux\n⚫ lun 14\/09/);
  });

  it('distingue ce qui monte de ce qui baisse, sans retirer le mot', () => {
    const notification = buildNotification(
      [],
      [signal('REOPENED', '2026-09-14', 0, 8), signal('DRAINING', '2026-09-15', 9, 2, BP)],
    )!;
    // Les deux signaux portent des sens opposes : chacun a donc son en-tete,
    // et les lignes de detail alternent avec eux.
    const [, up = '', , down = ''] = notification.body.split('\n');

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
