const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('tsx/cjs/api').register();

const {
  buildCoveragePoints,
  isPassengerPathOnCoverage,
  classifyMatchType,
} = require('../src/modules/rides/utils/coverage.ts');

const DELHI = { lat: 28.6139, lng: 77.209 };
const GURGAON = { lat: 28.4595, lng: 77.0266 };
const NEEMRANA = { lat: 27.9878, lng: 76.3878 };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };
const FARIDABAD = { lat: 28.4089, lng: 77.3178 };

const RADIUS_50KM = 50_000;

describe('Coverage radius matching', () => {
  it('builds ordered coverage points with stopovers', () => {
    const points = buildCoveragePoints(DELHI, JAIPUR, [GURGAON, NEEMRANA]);
    assert.equal(points.length, 4);
    assert.equal(points[0].role, 'source');
    assert.equal(points[points.length - 1].role, 'destination');
    assert.equal(points[1].role, 'stopover');
  });

  it('matches Faridabad → Neemrana on Delhi → Jaipur route within 50 km', () => {
    const coverage = buildCoveragePoints(DELHI, JAIPUR, [GURGAON, NEEMRANA]);
    const result = isPassengerPathOnCoverage(FARIDABAD, NEEMRANA, coverage, RADIUS_50KM);
    assert.equal(result.ok, true);
    assert.ok(result.pickupIdx < result.dropIdx);
  });

  it('rejects reverse Neemrana → Faridabad', () => {
    const coverage = buildCoveragePoints(DELHI, JAIPUR, [GURGAON, NEEMRANA]);
    const result = isPassengerPathOnCoverage(NEEMRANA, FARIDABAD, coverage, RADIUS_50KM);
    assert.equal(result.ok, false);
  });

  it('rejects Jaipur → Gurgaon (reverse on Delhi → Jaipur)', () => {
    const coverage = buildCoveragePoints(DELHI, JAIPUR, [GURGAON]);
    const result = isPassengerPathOnCoverage(JAIPUR, GURGAON, coverage, RADIUS_50KM);
    assert.equal(result.ok, false);
  });

  it('classifies exact vs nearby matches', () => {
    assert.equal(classifyMatchType(1, 1), 'exact');
    assert.equal(classifyMatchType(10, 5), 'nearby');
    assert.equal(classifyMatchType(30, 25), 'recommended');
  });
});
