import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countSnapshot, createHistoryBuilder, purgeHistory } from '../src/history.ts';
import { BP, PB, snapshot, t } from './helpers.ts';
import type { History } from '../src/types.ts';

describe('agregats history', () => {
  it('compte les OUI et les NON par date et par sens', () => {
    const counts = countSnapshot(
      snapshot(
        t('2026-10-17', '8441', 'OUI', '08:00', PB),
        t('2026-10-17', '8443', 'NON', '10:00', PB),
        t('2026-10-17', '8445', 'NON', '12:00', PB),
        t('2026-10-17', '8601', 'OUI', '18:00', BP),
        t('2026-10-18', '8441', 'OUI', '08:00', PB),
      ),
    );

    assert.deepEqual(counts.get('2026-10-17')?.get(PB), { d: '', oui: 1, non: 2 });
    assert.deepEqual(counts.get('2026-10-17')?.get(BP), { d: '', oui: 1, non: 0 });
    assert.deepEqual(counts.get('2026-10-18')?.get(PB), { d: '', oui: 1, non: 0 });
  });

  it('empile une observation par jour de collecte, dans l ordre', () => {
    const builder = createHistoryBuilder();
    builder.add('2026-09-17', snapshot(t('2026-10-17', '8441', 'OUI')));
    builder.add('2026-09-18', snapshot(t('2026-10-17', '8441', 'NON')));

    const history = builder.finish('2026-09-18');
    assert.deepEqual(history['2026-10-17']?.[PB], [
      { d: '2026-09-17', oui: 1, non: 0 },
      { d: '2026-09-18', oui: 0, non: 1 },
    ]);
  });

  it('purge les dates de voyage au-dela de la retention', () => {
    const history: History = {
      '2026-05-01': { [PB]: [] },
      '2026-05-05': { [PB]: [] },
      '2026-09-01': { [PB]: [] },
    };

    // J-120 avant le 2026-09-01 tombe le 2026-05-04 : cette date est conservee,
    // celle qui la precede ne l'est pas.
    const purged = purgeHistory(history, '2026-09-01');
    assert.deepEqual(Object.keys(purged).sort(), ['2026-05-05', '2026-09-01']);
  });
});
