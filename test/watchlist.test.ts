import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterEvents,
  hasRule,
  hasWatch,
  matchesWatchlist,
  parseWatchlist,
  setRule,
  setWatch,
} from '../src/watchlist.ts';
import { diffSnapshots } from '../src/diff.ts';
import { BP, PB, snapshot, t } from './helpers.ts';
import type { Watchlist } from '../src/types.ts';

const EMPTY: Watchlist = { watch: [], rules: [] };

describe('filtrage par la watchlist', () => {
  it('ne laisse rien passer quand la watchlist est vide', () => {
    assert.equal(matchesWatchlist(EMPTY, { date: '2026-10-17', dir: PB }), false);
  });

  it('matche une entree explicite avec sa fenetre horaire', () => {
    const watchlist: Watchlist = {
      watch: [{ date: '2026-10-17', dir: PB, after: '16:00' }],
      rules: [],
    };

    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-17', dir: PB, depart: '16:12' }),
      true,
    );
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-17', dir: PB, depart: '15:59' }),
      false,
    );
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-17', dir: BP, depart: '18:00' }),
      false,
    );
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-18', dir: PB, depart: '18:00' }),
      false,
    );
  });

  it('matche une entree sans sens dans les deux sens', () => {
    const watchlist: Watchlist = { watch: [{ date: '2026-10-17' }], rules: [] };
    assert.equal(matchesWatchlist(watchlist, { date: '2026-10-17', dir: PB }), true);
    assert.equal(matchesWatchlist(watchlist, { date: '2026-10-17', dir: BP }), true);
  });

  it('matche une regle recurrente sur le jour de la semaine', () => {
    const watchlist: Watchlist = {
      watch: [],
      rules: [{ weekday: 'fri', dir: PB, after: '16:00' }],
    };

    // 2026-10-16 est un vendredi, 2026-10-17 un samedi.
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-16', dir: PB, depart: '18:30' }),
      true,
    );
    assert.equal(
      matchesWatchlist(watchlist, { date: '2026-10-17', dir: PB, depart: '18:30' }),
      false,
    );
  });

  it('ne retient que les evenements surveilles', () => {
    const before = snapshot(
      t('2026-10-16', '8441', 'NON', '18:00', PB),
      t('2026-10-17', '8443', 'NON', '18:00', PB),
    );
    const after = snapshot(
      t('2026-10-16', '8441', 'OUI', '18:00', PB),
      t('2026-10-17', '8443', 'OUI', '18:00', PB),
    );

    const { events } = diffSnapshots(before, after, '2026-10-01');
    assert.equal(events.length, 2);

    const watchlist: Watchlist = { watch: [], rules: [{ weekday: 'fri', dir: PB }] };
    const kept = filterEvents(watchlist, events);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.date, '2026-10-16');
  });

});

describe('cles et gestes sur la watchlist', () => {
  it('compare par valeur, pas par identite d objet', () => {
    const watchlist: Watchlist = {
      watch: [{ date: '2026-10-17', dir: PB, after: '16:00' }],
      rules: [],
    };

    // L'objet vient d'un autre rendu : c'est exactement ce qu'un
    // rafraichissement produisait, et le filtre par identite n'y retirait rien.
    const jumeau = { date: '2026-10-17', dir: PB, after: '16:00' };

    assert.equal(hasWatch(watchlist, jumeau), true);
    assert.deepEqual(setWatch(watchlist, jumeau, false).watch, []);
  });

  it('ne confond pas une borne absente et une borne vide', () => {
    const jour: Watchlist = { watch: [{ date: '2026-10-17', dir: PB }], rules: [] };
    assert.equal(hasWatch(jour, { date: '2026-10-17', dir: PB, after: '16:00' }), false);
  });

  it('ne double jamais une entree deja posee', () => {
    const entry = { date: '2026-10-17', dir: PB, after: '16:00' };
    const once = setWatch(EMPTY, entry, true);
    const twice = setWatch(once, { ...entry }, true);
    assert.equal(twice.watch.length, 1);
  });

  it('ne double jamais une regle deja posee', () => {
    const rule = { weekday: 'fri', dir: PB, after: '16:00' } as const;
    const once = setRule(EMPTY, rule, true);
    assert.equal(hasRule(once, { ...rule }), true);
    assert.equal(setRule(once, { ...rule }, true).rules.length, 1);
    assert.deepEqual(setRule(once, { ...rule }, false).rules, []);
  });

  it('retire une entree sans toucher aux autres fenetres de la meme date', () => {
    const watchlist: Watchlist = {
      watch: [
        { date: '2026-10-17', dir: PB },
        { date: '2026-10-17', dir: PB, after: '07:12', before: '07:12' },
        { date: '2026-10-17', dir: BP, after: '07:12', before: '07:12' },
      ],
      rules: [],
    };

    const next = setWatch(watchlist, { date: '2026-10-17', dir: PB }, false);
    assert.equal(next.watch.length, 2);
    assert.equal(hasWatch(next, { date: '2026-10-17', dir: PB, after: '07:12', before: '07:12' }), true);
  });
});

describe('lecture d une watchlist venue d ailleurs', () => {
  it('refuse ce qui n en est pas une plutot que de rendre une liste vide', () => {
    // Le mode de panne combattu partout ici : une lecture ratee qui se fait
    // passer pour « rien a suivre », et qui ecrase.
    assert.equal(parseWatchlist(null), null);
    assert.equal(parseWatchlist('nope'), null);
    assert.equal(parseWatchlist({}), null);
    assert.equal(parseWatchlist({ watch: [] }), null);
    assert.deepEqual(parseWatchlist({ watch: [], rules: [] }), { watch: [], rules: [] });
  });

  it('ecarte les entrees qui ne sont pas des objets', () => {
    const parsed = parseWatchlist({ watch: [{ date: '2026-10-17' }, 42, null], rules: ['x'] });
    assert.deepEqual(parsed, { watch: [{ date: '2026-10-17' }], rules: [] });
  });
});
