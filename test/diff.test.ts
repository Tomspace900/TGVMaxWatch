import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DECISION_HORIZON_DAYS } from '../src/config.ts';
import { addDays } from '../src/dates.ts';
import { dateSignals } from '../src/diff.ts';
import { BP, PB, departures, t } from './helpers.ts';
import type { Availability, TrainRecord } from '../src/types.ts';

/*
 * Cadre du diff. Toutes les dates de voyage des tests lui sont posterieures, et
 * a une ou deux semaines : les signaux generaux s'arretent desormais a
 * `DECISION_HORIZON_DAYS`, et un fixture pose au-dela testerait la borne au
 * lieu de la regle qu'il nomme.
 */
const TODAY = '2026-10-10';

/**
 * Une journee de trains, chacun a **sa** minute.
 *
 * L'unite de compte est le depart : deux trains a la meme heure se replient en
 * un seul. Une flotte fabriquee sur quatre horaires ne comptait donc que quatre
 * departs, et les seuils de signal ne se declenchaient plus — ce que cette
 * fixture cachait tant que l'unite etait la rame.
 */
function fleet(date: string, count: number, availability: Availability, dir = PB): TrainRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const hour = String(6 + Math.floor(i / 4)).padStart(2, '0');
    const minute = String((i % 4) * 15).padStart(2, '0');
    return t(date, String(8000 + i), availability, `${hour}:${minute}`, dir);
  });
}

/*
 * Les seuils de ces regles viennent de l'archive reelle, pas d'une intuition :
 * notifier chaque train qui s'ouvre produisait 12 a 13 lignes par jour, ces
 * deux regles-la en donnent une a quatre.
 */
describe('signaux de date', () => {
  it('signale une date qui rouvre franchement', () => {
    const before = departures(...fleet('2026-10-17', 8, 'NON'));
    const after = departures(...fleet('2026-10-17', 8, 'OUI'));

    const signals = dateSignals(before, after, TODAY);
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
    const before = departures(...fleet('2026-10-17', 8, 'NON'));
    const after = departures(
      t('2026-10-17', '8000', 'OUI', '06:00'),
      ...fleet('2026-10-17', 8, 'NON').slice(1),
    );

    const signals = dateSignals(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('signale un creneau qui fond et dont il ne reste presque rien', () => {
    const before = departures(...fleet('2026-10-17', 9, 'OUI'));
    const after = departures(
      ...fleet('2026-10-17', 2, 'OUI'),
      ...fleet('2026-10-17', 9, 'NON').slice(2),
    );

    const signals = dateSignals(before, after, TODAY);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.kind, 'DRAINING');
    assert.equal(signals[0]?.before, 9);
    assert.equal(signals[0]?.after, 2);
  });

  it('ignore une fonte qui laisse de quoi choisir', () => {
    // 27 -> 20 est une grosse baisse, mais il reste vingt trains : rien
    // d'urgent. C'est le croisement vitesse/rarete qui fait l'information.
    const before = departures(...fleet('2026-10-17', 27, 'OUI'));
    const after = departures(
      ...fleet('2026-10-17', 20, 'OUI'),
      ...fleet('2026-10-17', 27, 'NON').slice(20),
    );

    const signals = dateSignals(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('ne signale rien pour une date qui vient d entrer dans la fenetre', () => {
    // Les dates entrent a zero place — les quatre mesurees sont entrees a 0/35,
    // 0/39, 0/33 et 0/29. Il n'y a rien a annoncer avant le lendemain.
    const before = departures(t('2026-10-17', '8441', 'OUI'));
    const after = departures(t('2026-10-17', '8441', 'OUI'), ...fleet('2026-10-18', 12, 'OUI'));

    const signals = dateSignals(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  /*
   * Mesure sur les vingt diffs de l'archive : 8 des 11 `REOPENED` portent sur
   * J+21 a J+30, aucun sur J+0 a J+2. C'est la mecanique de l'horizon — une
   * date y entre a zero place et se remplit le lendemain, toutes les dates le
   * font — donc un evenement previsible, donc un fond.
   */
  it('ne signale pas une date au-dela de l horizon de decision', () => {
    const far = addDays(TODAY, DECISION_HORIZON_DAYS + 1);
    const before = departures(...fleet(far, 8, 'NON'));
    const after = departures(...fleet(far, 8, 'OUI'));

    assert.deepEqual(dateSignals(before, after, TODAY), []);
  });

  it('signale la meme date un jour plus tot, a la limite exacte', () => {
    const edge = addDays(TODAY, DECISION_HORIZON_DAYS);
    const before = departures(...fleet(edge, 8, 'NON'));
    const after = departures(...fleet(edge, 8, 'OUI'));

    assert.equal(dateSignals(before, after, TODAY).length, 1);
  });

  it('ignore une date de voyage deja passee', () => {
    const before = departures(...fleet('2026-09-20', 8, 'NON'));
    const after = departures(...fleet('2026-09-20', 8, 'OUI'));

    const signals = dateSignals(before, after, TODAY);
    assert.deepEqual(signals, []);
  });

  it('classe les reouvertures avant les fontes', () => {
    const before = departures(...fleet('2026-10-17', 9, 'OUI'), ...fleet('2026-10-20', 8, 'NON', BP));
    const after = departures(
      ...fleet('2026-10-17', 2, 'OUI'),
      ...fleet('2026-10-17', 9, 'NON').slice(2),
      ...fleet('2026-10-20', 8, 'OUI', BP),
    );

    const signals = dateSignals(before, after, TODAY);
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.kind, 'REOPENED');
    assert.equal(signals[1]?.kind, 'DRAINING');
  });
});
