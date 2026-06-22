const { INDIAN_CITIES } = require('./routeMatcher');

/** YYYY-MM-DD in local timezone (avoids UTC off-by-one). */
function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInput(input) {
  if (!input) return null;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalDateString(d);
}

function normalizeTimeInput(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Combine local date + HH:mm into ISO UTC for storage. */
function parseDepartureAt(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const normalized = normalizeTimeInput(timeStr);
  if (!normalized) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = normalized.split(':').map(Number);
  const parsed = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isDepartureInFuture(departureAtIso, bufferMinutes = 1) {
  const dep = new Date(departureAtIso);
  const min = Date.now() + bufferMinutes * 60 * 1000;
  return dep.getTime() >= min;
}

function resolveCommuteCity(city, driverCity) {
  const pick = (value) => {
    if (!value) return null;
    const found = INDIAN_CITIES.find((c) => c.toLowerCase() === String(value).trim().toLowerCase());
    return found || null;
  };

  return pick(city) || pick(driverCity) || 'Delhi';
}

module.exports = {
  toLocalDateString,
  parseDateInput,
  parseDepartureAt,
  isDepartureInFuture,
  resolveCommuteCity,
  normalizeTimeInput,
};
