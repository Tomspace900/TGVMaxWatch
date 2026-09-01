import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  daysBetween,
  hourInParis,
  normalizeTime,
  timeToMinutes,
  todayInParis,
  weekdayKey,
} from '../src/dates.ts';

describe('dates', () => {
  it('ajoute des jours sans deriver au changement d heure', () => {
    // Nuit du passage a l'heure d'hiver en France.
    assert.equal(addDays('2026-10-24', 1), '2026-10-25');
    assert.equal(addDays('2026-10-25', 1), '2026-10-26');
    // Et au passage a l'heure d'ete.
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  });

  it('franchit les fins de mois et les annees bissextiles', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });

  it('compte les jours entre deux dates', () => {
    assert.equal(daysBetween('2026-09-17', '2026-10-17'), 30);
    assert.equal(daysBetween('2026-10-17', '2026-09-17'), -30);
    assert.equal(daysBetween('2026-09-17', '2026-09-17'), 0);
  });

  it('donne le jour de la semaine', () => {
    assert.equal(weekdayKey('2026-09-04'), 'fri');
    assert.equal(weekdayKey('2026-09-06'), 'sun');
  });

  it('ancre aujourd hui sur Paris, pas sur UTC', () => {
    // 23h30 UTC un 1er septembre, il est deja le 2 a Paris.
    assert.equal(todayInParis(new Date('2026-09-01T23:30:00Z')), '2026-09-02');
    assert.equal(todayInParis(new Date('2026-09-01T10:00:00Z')), '2026-09-01');
  });

  it('donne l heure de Paris des deux cotes du changement d heure', () => {
    // Heure d'ete : UTC+2.
    assert.equal(hourInParis(new Date('2026-07-01T14:00:00Z')), 16);
    // Heure d'hiver : UTC+1.
    assert.equal(hourInParis(new Date('2026-12-01T15:00:00Z')), 16);
    // Et l'execution jumelle ne doit pas passer.
    assert.notEqual(hourInParis(new Date('2026-07-01T15:00:00Z')), 16);
    assert.notEqual(hourInParis(new Date('2026-12-01T14:00:00Z')), 16);
  });

  it('normalise les heures et les convertit en minutes', () => {
    assert.equal(normalizeTime('06:06:00'), '06:06');
    assert.equal(normalizeTime('6:06'), '06:06');
    assert.equal(timeToMinutes('16:30'), 990);
  });
});
