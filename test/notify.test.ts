import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNotification } from '../src/notify.ts';
import type { DateSignal, Watch, WatchSignal } from '../src/types.ts';
import { BP, PB } from './helpers.ts';

const RETOUR: Watch = { dir: BP, from: '2026-09-24 18:00', to: '2026-09-25 11:00' };
const TRAIN: Watch = { dir: PB, from: '2026-09-28 19:11', to: '2026-09-28 19:11' };

const suivi = (kind: WatchSignal['kind'], before: number, after: number, watch = RETOUR): WatchSignal => ({
  kind,
  watch,
  before,
  after,
});

const general = (kind: DateSignal['kind'], date: string, before: number, after: number, dir = PB): DateSignal => ({
  kind,
  date,
  dir,
  before,
  after,
});

describe('buildNotification', () => {
  it('ne produit rien quand rien ne bouge', () => {
    assert.equal(buildNotification([], []), null);
  });

  /*
   * Le titre est la premiere ligne, jamais un resume fabrique a cote. Mesure
   * sur l'archive : 25 mouvements de creneau suivi etaient dans le corps et 2
   * seulement dans le titre, sous un « 7 trains ouverts » indiscernable du
   * bruit sur un ecran verrouille.
   */
  it('nomme le suivi et son avant/apres dans le titre', () => {
    const notification = buildNotification([suivi('FILLING', 1, 7)], [])!;
    assert.equal(notification.title, 'jeu 24/09 18h → ven 25/09 11h : 1 → 7 trains');
    // Le corps ne repete pas le titre : il ne garde que le sens.
    assert.equal(notification.body, 'Bordeaux → Paris');
    assert.match(notification.url, /date=2026-09-24/);
  });

  it('dit un train seul ouvert ou complet, sans compte', () => {
    assert.equal(buildNotification([suivi('OPENED', 0, 1, TRAIN)], [])!.title, 'lun 28/09 19:11 : ouvert');
    assert.equal(buildNotification([suivi('CLOSED', 1, 0, TRAIN)], [])!.title, 'lun 28/09 19:11 : complet');
  });

  it('ne laisse jamais une alerte generale passer devant un suivi', () => {
    const notification = buildNotification(
      [suivi('DRAINING', 3, 1)],
      [general('REOPENED', '2026-09-26', 0, 12)],
    )!;
    assert.match(notification.title, /^jeu 24\/09/);
    assert.deepEqual(notification.body.split('\n'), [
      'Bordeaux → Paris',
      'Paris → Bordeaux',
      '🟢 rouvre sam 26/09 : 0 → 12 trains',
    ]);
  });

  it('nomme une alerte generale seule par sa date, pas par un compte', () => {
    const notification = buildNotification(
      [],
      [general('REOPENED', '2026-09-26', 0, 12), general('REOPENED', '2026-09-27', 0, 7)],
    )!;
    assert.equal(notification.title, 'sam 26/09 rouvre : 0 → 12 trains');
  });

  /*
   * Le budget se prend sur ce que personne n'a demande. Mesure sur l'archive :
   * le 03/09, deux lignes coupees, les deux suivies, pendant que quatre alertes
   * generales occupaient la place.
   */
  it('coupe les alertes generales avant les suivis, et le dit', () => {
    const suivis = [0, 1, 2, 3].map((i) =>
      suivi('OPENED', 0, 1, { dir: BP, from: `2026-09-2${i} 18:00`, to: `2026-09-2${i} 21:00` }),
    );
    const generales = [6, 7, 8, 9].map((d) => general('REOPENED', `2026-09-0${d}`, 0, 9));
    const lines = buildNotification(suivis, generales)!.body.split('\n');

    // Quatre suivis : le premier est le titre, les trois autres dans le corps.
    assert.equal(lines.filter((line) => line.startsWith('🟢 ouvre')).length, 3);
    assert.equal(lines.filter((line) => line.includes('rouvre')).length, 2);
    assert.equal(lines.at(-1), '+2 autres');
  });

  it('ne met aucune marque dans le titre', () => {
    const notification = buildNotification([suivi('OPENED', 0, 2)], [])!;
    assert.equal(/[🟢🟠⚫]/u.test(notification.title), false);
  });
});
