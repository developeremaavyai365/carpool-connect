/** Flexible route/location matching for commute search filters. */

function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function significantTokens(text) {
  return normalize(text)
    .split(/[,|/]+|\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/**
 * Returns true if query matches route text (substring, reverse substring, or token overlap).
 */
function routeMatchesFilter(query, routeText) {
  const q = normalize(query);
  if (!q) return true;

  const r = normalize(routeText);
  if (!r) return false;
  if (r.includes(q) || q.includes(r)) return true;

  const qTokens = significantTokens(q);
  if (!qTokens.length) return r.includes(q);

  return qTokens.some((token) => r.includes(token));
}

function buildRouteChain(row) {
  const stopovers = Array.isArray(row?.stopovers) ? row.stopovers : [];
  return [row?.route_from, ...stopovers, row?.route_to].filter(Boolean);
}

/**
 * Match browse filters against route endpoints and stopovers in order.
 * When both from and to are set, pickup must appear before drop on the chain.
 */
function commuteMatchesRouteFilters(route_from, route_to, row) {
  const chain = buildRouteChain(row);
  if (!route_from && !route_to) return true;

  if (route_from && route_to) {
    let fromIdx = -1;
    let toIdx = -1;
    chain.forEach((label, i) => {
      if (fromIdx < 0 && routeMatchesFilter(route_from, label)) fromIdx = i;
      if (routeMatchesFilter(route_to, label)) toIdx = i;
    });
    return fromIdx >= 0 && toIdx > fromIdx;
  }

  if (route_from) {
    return chain.some((label) => routeMatchesFilter(route_from, label));
  }

  return chain.some((label) => routeMatchesFilter(route_to, label));
}

module.exports = {
  routeMatchesFilter,
  significantTokens,
  buildRouteChain,
  commuteMatchesRouteFilters,
};
