import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterEvents, matchesWatchlist } from '../src/watchlist.ts';
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
