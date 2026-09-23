import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { watchSignals } from '../src/slots.ts';
import type { Watch } from '../src/types.ts';
import { BP, PB, departures, t } from './helpers.ts';

/* Jeudi 24 et vendredi 25 septembre 2026, vers Paris. */
const THU = '2026-09-24';
const FRI = '2026-09-25';

/** « Je rentre entre jeudi 18h et vendredi 11h » : le besoin qui a remplace les regles. */
const RETOUR: Watch = { dir: BP, from: `${THU} 18:00`, to: `${FRI} 11:00` };

/** Une nuit de trains vers Paris : les `open` premiers ouverts, dans l'ordre. */
function nuitRecords(open: number) {
  const heures = [`${THU}|18:11`, `${THU}|19:11`, `${THU}|20:39`, `${FRI}|06:04`, `${FRI}|07:11`, `${FRI}|10:41`];
  return heures.map((key, i) => {
    const [date = '', depart = ''] = key.split('|');
    return t(date, String(8400 + i), i < open ? 'OUI' : 'NON', depart, BP);
  });
}

const nuit = (open: number) => departures(...nuitRecords(open));

describe('watchSignals', () => {
  it('compte une fenetre qui passe la nuit, sur ses deux jours', () => {
    const [signal] = watchSignals([RETOUR], nuit(1), nuit(5));
    assert.equal(signal?.kind, 'FILLING');
    assert.equal(signal?.before, 1);
    assert.equal(signal?.after, 5);
  });

  it('ne compte que les trains de la fenetre et du sens', () => {
    const hors = (open: 'OUI' | 'NON') =>
      departures(
        t(THU, '8400', 'NON', '18:11', BP),
        t(THU, '8401', open, '17:59', BP), // une minute avant
        t(FRI, '8402', open, '11:01', BP), // une minute apres
        t(THU, '8403', open, '19:00', PB), // l'autre sens
      );
    assert.deepEqual(watchSignals([RETOUR], hors('NON'), hors('OUI')), []);
  });

  /*
   * Un creneau est vide la plupart du temps : « il s'ouvre » est l'evenement
   * frequent et utile, et un seul train suffit — le compte porte sur tous les
   * trains de la fenetre, sinon une fenetre a zero n'aurait jamais de compte.
   */
  it('voit une fenetre vide s ouvrir', () => {
    assert.equal(watchSignals([RETOUR], nuit(0), nuit(1))[0]?.kind, 'OPENED');
  });

  /* `2 -> 1` a deux jours du depart : exactement la nouvelle qu'on attend. */
  it('signale une baisse d un seul train quand il n en reste presque plus', () => {
    assert.equal(watchSignals([RETOUR], nuit(2), nuit(1))[0]?.kind, 'DRAINING');
  });

  it('se tait sur un mouvement qui ne change pas la decision', () => {
    // On avait deja de quoi choisir, dans les deux sens du mouvement.
    assert.deepEqual(watchSignals([RETOUR], nuit(6), nuit(5)), []);
    assert.deepEqual(watchSignals([RETOUR], nuit(4), nuit(6)), []);
  });

  it('dit qu une fenetre se ferme', () => {
    assert.equal(watchSignals([RETOUR], nuit(2), nuit(0))[0]?.kind, 'CLOSED');
  });

  /*
   * Les trajets longs comptent par defaut : ce sont des solutions. Les ecarter
   * est un choix, pose dans l'editeur.
   */
  it('compte les trajets longs, sauf si on les ecarte', () => {
    const avant = departures(t(THU, '8400', 'NON', '18:11', BP, 210));
    const apres = departures(t(THU, '8400', 'OUI', '18:11', BP, 210));
    assert.equal(watchSignals([RETOUR], avant, apres).length, 1);
    assert.deepEqual(watchSignals([{ ...RETOUR, skipLong: true }], avant, apres), []);
  });

  it('suit un train seul avec le meme mecanisme', () => {
    const train: Watch = { dir: BP, from: `${THU} 18:11`, to: `${THU} 18:11` };
    assert.equal(watchSignals([train], nuit(0), nuit(1))[0]?.kind, 'OPENED');
    assert.equal(watchSignals([train], nuit(1), nuit(0))[0]?.kind, 'CLOSED');
  });

  it('ne dit rien d une fenetre absente du releve precedent', () => {
    // Elle vient d'entrer dans l'horizon de la source : pas de transition.
    assert.deepEqual(watchSignals([RETOUR], departures(), nuit(3)), []);
  });

  it('met ce qui devient rare en tete, puis le plus gros mouvement', () => {
    const aller: Watch = { dir: PB, from: `${THU} 06:00`, to: `${THU} 12:00` };
    const matin = (open: number) =>
      ['07:00', '08:00', '09:00'].map((depart, i) => t(THU, String(8500 + i), i < open ? 'OUI' : 'NON', depart, PB));

    // Le retour passe de 1 a 6 (il se remplit), l'aller de 3 a 1 (il se vide).
    const avant = departures(...nuitRecords(1), ...matin(3));
    const apres = departures(...nuitRecords(6), ...matin(1));
    assert.deepEqual(
      watchSignals([RETOUR, aller], avant, apres).map((signal) => signal.kind),
      ['DRAINING', 'FILLING'],
    );
  });
});
