import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { durationMinutes, durationTier, formatDuration } from '../src/duration.ts';

describe('duree de trajet', () => {
  it('calcule une duree simple', () => {
    assert.equal(durationMinutes('06:06', '09:02'), 176);
  });

  it('gere le passage de minuit', () => {
    // Sans la correction, on obtiendrait -1295 minutes, donc un palier
    // `direct` sur un train de 2h25.
    assert.equal(durationMinutes('23:50', '02:15'), 145);
  });

  it('gere une duree nulle sans basculer sur 24h', () => {
    assert.equal(durationMinutes('08:00', '08:00'), 0);
  });

  it('classe les paliers aux bornes', () => {
    assert.equal(durationTier(125), 'direct');
    assert.equal(durationTier(140), 'direct');
    assert.equal(durationTier(141), 'intermediaire');
    assert.equal(durationTier(180), 'intermediaire');
    assert.equal(durationTier(181), 'long');
    assert.equal(durationTier(210), 'long');
  });

  it('formate en heures et minutes', () => {
    assert.equal(formatDuration(134), '2h14');
    assert.equal(formatDuration(185), '3h05');
    assert.equal(formatDuration(120), '2h00');
  });
});
