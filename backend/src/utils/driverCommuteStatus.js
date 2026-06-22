/** Classify driver commutes into dashboard buckets (derived from status + departure time). */

const ACTIVE_WINDOW_HOURS = 6;
const AUTO_COMPLETE_AFTER_HOURS = 12;

function parseDepartureMs(commute) {
  const t = new Date(commute?.departure_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function bucketDriverCommutes(commutes = []) {
  const now = Date.now();
  const buckets = { upcoming: [], active: [], completed: [], cancelled: [] };

  for (const commute of commutes) {
    const status = String(commute.status || 'active').toLowerCase();

    if (status === 'cancelled') {
      buckets.cancelled.push(commute);
      continue;
    }

    if (status === 'completed' || status === 'expired') {
      buckets.completed.push(commute);
      continue;
    }

    const dep = parseDepartureMs(commute);
    const hoursSince = (now - dep) / 3600000;

    if (status === 'in_progress' || (dep <= now && hoursSince <= ACTIVE_WINDOW_HOURS)) {
      buckets.active.push(commute);
    } else if (dep > now) {
      buckets.upcoming.push(commute);
    } else {
      buckets.completed.push(commute);
    }
  }

  const byDeparture = (a, b) => parseDepartureMs(a) - parseDepartureMs(b);
  const byDepartureDesc = (a, b) => parseDepartureMs(b) - parseDepartureMs(a);

  buckets.upcoming.sort(byDeparture);
  buckets.active.sort(byDeparture);
  buckets.completed.sort(byDepartureDesc);
  buckets.cancelled.sort(byDepartureDesc);

  return buckets;
}

function buildDriverStats(buckets) {
  return {
    upcoming: buckets.upcoming.length,
    active: buckets.active.length,
    completed: buckets.completed.length,
    cancelled: buckets.cancelled.length,
    total: buckets.upcoming.length + buckets.active.length
      + buckets.completed.length + buckets.cancelled.length,
  };
}

function shouldAutoComplete(commute, now = Date.now()) {
  const status = String(commute.status || 'active').toLowerCase();
  if (status !== 'active' && status !== 'upcoming' && status !== 'in_progress') return false;
  const dep = parseDepartureMs(commute);
  const hoursSince = (now - dep) / 3600000;
  return dep > 0 && hoursSince >= AUTO_COMPLETE_AFTER_HOURS;
}

module.exports = {
  bucketDriverCommutes,
  buildDriverStats,
  shouldAutoComplete,
  ACTIVE_WINDOW_HOURS,
  AUTO_COMPLETE_AFTER_HOURS,
};
