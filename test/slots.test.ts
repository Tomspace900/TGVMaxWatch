import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DECISION_HORIZON_DAYS } from '../src/config.ts';
import { addDays, daysBetween } from '../src/dates.ts';
import { DAY_PERIODS } from '../src/periods.ts';
import { isCoveredBySlot, slotSignals, watchedSlots } from '../src/slots.ts';
import type { Watchlist } from '../src/types.ts';
import { PB, departures, t } from './helpers.ts';

const MATIN = DAY_PERIODS.find((period) => period.key === 'matin')!;
const TODAY = '2026-09-07';
/* 2026-09-17 est un jeudi. */
const THU = '2026-09-17';

const RULE: Watchlist = {
  watch: [],
  rules: [{ weekday: 'thu', dir: PB, after: MATIN.after, before: MATIN.before }],
};

describe('watchedSlots', () => {
  it('trouve les dates que couvre une regle recurrente', () => {
    const slots = watchedSlots(RULE, departures(t(THU, '8441', 'NON', '07:12')), TODAY);
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.date, THU);
    assert.equal(slots[0]!.label, 'matin');
  });

  /*
   * Une entree posee sur une minute designe un train : l'evenement de train le
   * couvre deja, a la bonne maille. En faire aussi un creneau produirait deux
   * lignes pour le meme fait.
   */
  it('ignore un suivi pose sur un train precis', () => {
    const watchlist: Watchlist = {
      watch: [{ date: THU, dir: PB, after: '07:12', before: '07:12' }],
      rules: [],
    };
    assert.deepEqual(watchedSlots(watchlist, departures(t(THU, '8441', 'OUI', '07:12')), TODAY), []);
  });

  it('retient une journee entiere, qui n a pas de bornes', () => {
    const watchlist: Watchlist = { watch: [{ date: THU, dir: PB }], rules: [] };
    const slots = watchedSlots(watchlist, departures(t(THU, '8441', 'OUI', '07:12')), TODAY);
    assert.equal(slots[0]!.label, 'toute la journée');
  });

  it('ne remonte pas dans le passe', () => {
    const watchlist: Watchlist = { watch: [{ date: '2026-09-01', dir: PB }], rules: [] };
    assert.deepEqual(
      watchedSlots(watchlist, departures(t('2026-09-01', '8441', 'OUI', '07:12')), TODAY),
      [],
    );
  });

  it('ne cree qu un creneau quand deux entrees decrivent la meme fenetre', () => {
    const watchlist: Watchlist = {
      watch: [{ date: THU, dir: PB, after: MATIN.after, before: MATIN.before }],
      rules: RULE.rules,
    };
    assert.equal(watchedSlots(watchlist, departures(t(THU, '8441', 'OUI', '07:12')), TODAY).length, 1);
  });
});

describe('slotSignals', () => {
  /*
   * Le piege du projet, a l'echelle du creneau.
   *
   * En ne comptant que les trains ouverts, un creneau vide n'aurait pas de cle
   * et « il s'ouvre » ne pourrait litteralement jamais se produire — c'est
   * l'erreur exacte que `filterNewDates` avait deja faite sur les dates. Le
   * compte porte donc sur tous les trains de la fenetre.
   */
  it('voit un creneau vide s ouvrir', () => {
    const before = departures(t(THU, '8441', 'NON', '07:12'), t(THU, '8443', 'NON', '09:30'));
    const after = departures(t(THU, '8441', 'OUI', '07:12'), t(THU, '8443', 'NON', '09:30'));

    const signals = slotSignals(RULE, before, after, TODAY);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]!.kind, 'SLOT_OPENED');
    assert.equal(signals[0]!.before_count, 0);
    assert.equal(signals[0]!.after_count, 1);
    assert.equal(signals[0]!.label, 'matin');
  });

  it('ne compte que les trains de la fenetre', () => {
    // Le 19h04 est hors du matin : son ouverture ne doit rien declencher.
    const before = departures(t(THU, '8441', 'NON', '07:12'), t(THU, '8999', 'NON', '19:04'));
    const after = departures(t(THU, '8441', 'NON', '07:12'), t(THU, '8999', 'OUI', '19:04'));
    assert.deepEqual(slotSignals(RULE, before, after, TODAY), []);
  });

  it('signale un creneau qui se vide', () => {
    const before = departures(
      t(THU, '8441', 'OUI', '07:12'),
      t(THU, '8443', 'OUI', '08:30'),
      t(THU, '8445', 'OUI', '09:30'),
    );
    const after = departures(
      t(THU, '8441', 'OUI', '07:12'),
      t(THU, '8443', 'NON', '08:30'),
      t(THU, '8445', 'NON', '09:30'),
    );

    const signals = slotSignals(RULE, before, after, TODAY);
    assert.equal(signals[0]!.kind, 'SLOT_DRAINING');
    assert.equal(signals[0]!.before_count, 3);
    assert.equal(signals[0]!.after_count, 1);
  });

  /*
   * Tomber a zero, c'est ferme, pas « en train de se vider » — et ca se dit.
   *
   * Le creneau se taisait dans ce cas : « il ne reste plus rien jeudi matin »
   * est pourtant la seule ligne qui fasse regarder un autre jour, et la seule
   * qui dispense d'ouvrir l'application pour le verifier.
   */
  it('nomme une fonte qui atteint zero autrement qu une fonte', () => {
    const before = departures(t(THU, '8441', 'OUI', '07:12'), t(THU, '8443', 'OUI', '08:30'));
    const after = departures(t(THU, '8441', 'NON', '07:12'), t(THU, '8443', 'NON', '08:30'));

    const signals = slotSignals(RULE, before, after, TODAY);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]!.kind, 'SLOT_CLOSED');
    assert.equal(signals[0]!.after_count, 0);
  });

  /*
   * L'ancienne regle exigeait une baisse d'au moins deux **et** deux restants
   * au plus. `2 -> 1` a deux jours du depart ne passait pas — exactement la
   * nouvelle qu'on attend. Mesure : 20 des 25 mouvements de creneau de
   * l'archive, dans les quatorze jours, ne produisaient aucun signal.
   */
  it('signale une baisse d un seul train quand il n en reste presque plus', () => {
    const before = departures(t(THU, '8441', 'OUI', '07:12'), t(THU, '8443', 'OUI', '08:30'));
    const after = departures(t(THU, '8441', 'OUI', '07:12'), t(THU, '8443', 'NON', '08:30'));

    const signals = slotSignals(RULE, before, after, TODAY);
    assert.equal(signals[0]!.kind, 'SLOT_DRAINING');
    assert.equal(signals[0]!.after_count, 1);
  });

  it('ignore une baisse qui laisse de quoi choisir', () => {
    // 9 -> 8 ne demande rien a personne : la rarete decide, pas l'ampleur.
    const open = (n: number) =>
      departures(
        ...Array.from({ length: 9 }, (_, i) =>
          t(THU, String(8000 + i), i < n ? 'OUI' : 'NON', `0${5 + i}:00`),
        ),
      );
    assert.deepEqual(slotSignals(RULE, open(9), open(8), TODAY), []);
  });

  /*
   * Une hausse ne se dit que lorsqu'elle **sort** de la rarete. `1 -> 7` est
   * une nouvelle, `5 -> 9` n'en est pas une : on avait deja de quoi choisir.
   */
  it('signale un creneau qui se remplit depuis la rarete', () => {
    const open = (n: number) =>
      departures(
        ...Array.from({ length: 9 }, (_, i) =>
          t(THU, String(8000 + i), i < n ? 'OUI' : 'NON', `0${5 + i}:00`),
        ),
      );

    const signals = slotSignals(RULE, open(1), open(7), TODAY);
    assert.equal(signals[0]!.kind, 'SLOT_FILLING');
    assert.equal(signals[0]!.before_count, 1);
    assert.equal(signals[0]!.after_count, 7);

    assert.deepEqual(slotSignals(RULE, open(5), open(9), TODAY), []);
  });

  /*
   * Une regle recurrente ratisse cinq jeudis d'un coup et n'en designe aucun :
   * six des neuf ouvertures de creneau de l'archive portaient sur J+14 a J+30,
   * c'est-a-dire sur le jeudi d'apres le jeudi d'apres.
   */
  it('arrete une regle recurrente a l horizon de decision', () => {
    // Le jeudi d'apres le jeudi suivi : celui que la regle ratisse sans que
    // personne ne l'ait designe. L'assertion de position le garde honnete — un
    // fixture qui repasserait sous l'horizon testerait autre chose en silence.
    const far = addDays(THU, 7);
    assert.ok(daysBetween(TODAY, far) > DECISION_HORIZON_DAYS);
    const rule: Watchlist = {
      watch: [],
      rules: [{ weekday: 'thu', dir: PB, after: MATIN.after, before: MATIN.before }],
    };
    const before = departures(t(far, '8441', 'NON', '07:12'), t(far, '8443', 'NON', '09:30'));
    const after = departures(t(far, '8441', 'OUI', '07:12'), t(far, '8443', 'OUI', '09:30'));

    assert.deepEqual(slotSignals(rule, before, after, TODAY), []);

    // Mais poser la meme fenetre sur cette date-la est une intention, et elle
    // passe : personne ne suit le 15/10 par accident.
    const dated: Watchlist = {
      watch: [{ date: far, dir: PB, after: MATIN.after, before: MATIN.before }],
      rules: [],
    };
    assert.equal(slotSignals(dated, before, after, TODAY).length, 1);
  });

  /*
   * Le tri repond a « faut-il ouvrir l'application maintenant ? », et il reste
   * deux trains y repond mieux que il y en a huit. Le tri precedent mettait les
   * ouvertures devant les fontes, ce qui revenait a dire qu'une bonne nouvelle
   * decide plus qu'une mauvaise.
   */
  it('met ce qui devient rare en tete, quel que soit le sens du mouvement', () => {
    const watchlist: Watchlist = {
      watch: [
        { date: THU, dir: PB, after: MATIN.after, before: MATIN.before },
        { date: THU, dir: PB, after: '19:00', before: '23:59' },
      ],
      rules: [],
    };
    const before = departures(
      t(THU, '8441', 'NON', '07:12'),
      t(THU, '8443', 'NON', '08:30'),
      t(THU, '8445', 'NON', '09:30'),
      t(THU, '8901', 'OUI', '19:04'),
      t(THU, '8903', 'OUI', '20:04'),
      t(THU, '8905', 'OUI', '21:04'),
    );
    const after = departures(
      t(THU, '8441', 'OUI', '07:12'),
      t(THU, '8443', 'OUI', '08:30'),
      t(THU, '8445', 'OUI', '09:30'),
      t(THU, '8901', 'OUI', '19:04'),
      t(THU, '8903', 'NON', '20:04'),
      t(THU, '8905', 'NON', '21:04'),
    );

    const signals = slotSignals(watchlist, before, after, TODAY);
    assert.equal(signals.length, 2);
    assert.equal(signals[0]!.label, 'soir');
    assert.equal(signals[0]!.after_count, 1);
    assert.equal(signals[1]!.label, 'matin');
  });

  /*
   * Une date qui vient d'entrer dans l'horizon entre a zero : il n'y a pas de
   * transition a lire, et l'annoncer ferait une alerte par nouvelle date.
   */
  it('ne dit rien d une date absente du snapshot precedent', () => {
    const after = departures(t(THU, '8441', 'OUI', '07:12'));
    assert.deepEqual(slotSignals(RULE, departures(), after, TODAY), []);
  });

  it('ne dit rien quand rien n est suivi', () => {
    const before = departures(t(THU, '8441', 'NON', '07:12'));
    const after = departures(t(THU, '8441', 'OUI', '07:12'));
    assert.deepEqual(slotSignals({ watch: [], rules: [] }, before, after, TODAY), []);
  });

  it('respecte le sens de la regle', () => {
    const before = departures(t(THU, '8441', 'NON', '07:12', 'FRBOJ>FRPMO'));
    const after = departures(t(THU, '8441', 'OUI', '07:12', 'FRBOJ>FRPMO'));
    assert.deepEqual(slotSignals(RULE, before, after, TODAY), []);
  });
});

describe('isCoveredBySlot', () => {
  /*
   * Sans ce filtre, un creneau qui s'ouvre avec trois trains produirait quatre
   * lignes : le creneau, puis les trois horaires.
   */
  it('absorbe les trains qui ont ouvert le creneau', () => {
    const before = departures(t(THU, '8441', 'NON', '07:12'));
    const after = departures(t(THU, '8441', 'OUI', '07:12'));
    const signals = slotSignals(RULE, before, after, TODAY);

    const event = {
      kind: 'OPEN' as const,
      date: THU,
      dir: PB,
      trainNos: ['8441'],
      depart: '07:12',
      arrivee: '09:20',
      durationMin: 128,
      tier: 'direct' as const,
    };
    assert.equal(isCoveredBySlot(signals, event), true);
    assert.equal(isCoveredBySlot(signals, { ...event, depart: '19:04' }), false);
  });
});
