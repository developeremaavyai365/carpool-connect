const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('tsx/cjs/api').register();

const {
  getRoutePosition,
  isPointOnRoute,
  isPassengerPathOnDriverRoute,
  haversineM,
} = require('../src/modules/rides/utils/geospatial.ts');

/** Delhi → Jaipur corridor (simplified straight-ish line via Gurgaon / Neemrana) */
const DELHI_JAIPUR = [
  [77.209, 28.6139],
  [77.0266, 28.4595],
  [76.3878, 27.9878],
  [75.7873, 26.9124],
];

describe('Geospatial utilities', () => {
  it('haversineM returns positive distance', () => {
    const d = haversineM({ lat: 28.6139, lng: 77.209 }, { lat: 26.9124, lng: 75.7873 });
    assert.ok(d > 200000 && d < 350000);
  });

  it('isPointOnRoute detects Gurgaon on Delhi-Jaipur route', () => {
    const gurgaon = { lat: 28.4595, lng: 77.0266 };
    assert.equal(isPointOnRoute(gurgaon, DELHI_JAIPUR), true);
  });

  it('getRoutePosition orders Gurgaon before Neemrana', () => {
    const gurgaon = { lat: 28.4595, lng: 77.0266 };
    const neemrana = { lat: 27.9878, lng: 76.3878 };
    const gPos = getRoutePosition(gurgaon, DELHI_JAIPUR);
    const nPos = getRoutePosition(neemrana, DELHI_JAIPUR);
    assert.ok(gPos >= 0 && nPos >= 0);
    assert.ok(gPos < nPos);
  });

  it('isPassengerPathOnDriverRoute matches Gurgaon → Neemrana on Delhi → Jaipur', () => {
    const pickup = { lat: 28.4595, lng: 77.0266 };
    const drop = { lat: 27.9878, lng: 76.3878 };
    assert.equal(isPassengerPathOnDriverRoute(pickup, drop, DELHI_JAIPUR), true);
  });

  it('rejects reverse passenger path', () => {
    const pickup = { lat: 27.9878, lng: 76.3878 };
    const drop = { lat: 28.4595, lng: 77.0266 };
    assert.equal(isPassengerPathOnDriverRoute(pickup, drop, DELHI_JAIPUR), false);
  });
});
