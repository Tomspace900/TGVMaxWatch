import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectFor, sortRecords } from '../src/sncf.ts';
import { env } from '../src/push.ts';
import { PB, t } from './helpers.ts';

const REQUIRED = [
  'date',
  'train_no',
  'origine_iata',
  'destination_iata',
  'heure_depart',
  'heure_arrivee',
  'od_happy_card',
];

describe('selection des colonnes', () => {
  it('ajoute les colonnes optionnelles quand le dataset les declare', () => {
    const select = selectFor([...REQUIRED, 'entity', 'axe', 'origine']);
    assert.deepEqual(select, [...REQUIRED, 'entity', 'axe']);
  });

  it('les omet quand elles ne sont pas declarees', () => {
    // Un `select` portant une colonne inconnue renvoie 400 : le collecteur
    // quotidien tomberait pour un simple agrement d'affichage.
    assert.deepEqual(selectFor(REQUIRED), REQUIRED);
  });

  it('n en ajoute qu une si une seule existe', () => {
    assert.deepEqual(selectFor([...REQUIRED, 'entity']), [...REQUIRED, 'entity']);
  });

  it('reste sur le socle vital si le dataset ne declare rien', () => {
    assert.deepEqual(selectFor([]), REQUIRED);
  });
});

describe('tri des enregistrements', () => {
  it('ordonne par date, sens, heure puis numero', () => {
    const sorted = sortRecords([
      t('2026-10-18', '8443', 'OUI', '08:00', PB),
      t('2026-10-17', '8445', 'OUI', '10:00', PB),
      t('2026-10-17', '8441', 'OUI', '06:00', PB),
    ]);

    // Un ordre stable garde le diff git lisible d'un snapshot a l'autre.
    assert.deepEqual(
      sorted.map((record) => `${record.date} ${record.heure_depart}`),
      ['2026-10-17 06:00', '2026-10-17 10:00', '2026-10-18 08:00'],
    );
  });
});

describe('variables d environnement', () => {
  it('traite une chaine vide comme absente', () => {
    // Un secret GitHub non defini arrive en chaine vide. Sans ce filtre, la
    // valeur traverse `??`, court-circuite la cle du code, et fait tomber le
    // collecteur alors que le canal d'alerte est simplement non configure.
    process.env['TGVMAX_ENV_TEST'] = '';
    assert.equal(env('TGVMAX_ENV_TEST'), undefined);

    process.env['TGVMAX_ENV_TEST'] = '   ';
    assert.equal(env('TGVMAX_ENV_TEST'), undefined);

    process.env['TGVMAX_ENV_TEST'] = ' cle ';
    assert.equal(env('TGVMAX_ENV_TEST'), 'cle');

    delete process.env['TGVMAX_ENV_TEST'];
    assert.equal(env('TGVMAX_ENV_TEST'), undefined);
  });
});
