/** Classify driver commutes into dashboard buckets (mirrors backend logic). */

const ACTIVE_WINDOW_HOURS = 6;

function parseDepartureMs(commute) {
  const t = new Date(commute?.departure_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function bucketDriverCommutes(commutes = []) {
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

  return buckets;
}

export function mergeDriverCommute(existing, update) {
  if (!update?.id) return existing;
  if (!existing?.id || String(existing.id) !== String(update.id)) return update;
  return { ...existing, ...update };
}

export function applyDriverCommuteEvent(list, commute, eventType) {
  if (!commute?.id) return list;
  const id = String(commute.id);

  if (eventType === 'DELETE' || commute.status === 'cancelled') {
    return list.filter((c) => String(c.id) !== id);
  }

  const idx = list.findIndex((c) => String(c.id) === id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = mergeDriverCommute(next[idx], commute);
    return next;
  }
  return [commute, ...list];
}
