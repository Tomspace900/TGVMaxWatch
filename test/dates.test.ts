import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  daysBetween,
  hourInParis,
  isParisHourWithin,
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

/*
 * Les quatre executions planifiees de `remind` sont parties entre 17h28 et
 * 18h25 UTC pour des crons de 14h et 15h. Le garde-fou exigeait 16h pile a
 * Paris : il a trouve 19h et 20h, et le rappel n'est jamais parti une seule
 * fois. Ce sont ces instants-la qui sont rejoues ici.
 */
describe('fenetre parisienne', () => {
  const FROM = 7;
  const UNTIL = 16;

  it('rejette les retards observes en production', () => {
    for (const instant of [
      '2026-09-01T17:28:51Z',
      '2026-09-01T18:09:01Z',
      '2026-09-02T17:28:31Z',
      '2026-09-02T18:24:57Z',
    ]) {
      assert.equal(
        isParisHourWithin(FROM, UNTIL, new Date(instant)),
        false,
        `${instant} devrait etre hors fenetre`,
      );
    }
  });

  it('accepte les nouveaux crons, retard compris', () => {
    // 06:00 et 09:00 UTC, a l'heure puis avec cinq heures de retard.
    for (const instant of [
      '2026-09-03T06:00:00Z',
      '2026-09-03T09:00:00Z',
      '2026-09-03T11:00:00Z',
      '2026-09-03T14:00:00Z',
    ]) {
      assert.equal(
        isParisHourWithin(FROM, UNTIL, new Date(instant)),
        true,
        `${instant} devrait etre dans la fenetre`,
      );
    }
  });

  it('tient en heure d hiver, ou Paris est a UTC+1', () => {
    assert.equal(isParisHourWithin(FROM, UNTIL, new Date('2026-01-15T06:00:00Z')), true);
    assert.equal(isParisHourWithin(FROM, UNTIL, new Date('2026-01-15T16:30:00Z')), false);
  });
});
