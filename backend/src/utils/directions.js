const { calculateRoutes } = require('../services/routeEngine');

/**
 * Legacy entry — delegates to real route engine (ORS / OSRM).
 */
async function getRouteOptions(routeFrom, routeTo, options = {}) {
  const fromLabel = (routeFrom || '').trim();
  const toLabel = (routeTo || '').trim();
  if (!fromLabel || !toLabel) {
    return { routes: [], source: 'none' };
  }

  try {
    const result = await calculateRoutes({
      route_from: fromLabel,
      route_to: toLabel,
      stopovers: options.stopovers || [],
      city: options.city,
      departure_at: options.departure_at,
    });
    return {
      routes: result.routes,
      source: result.source,
      waypoints: result.waypoints,
      default_route_id: result.default_route_id,
    };
  } catch (err) {
    if (err.payload) return err.payload;
    console.warn('[Directions] Route calculation failed:', err.message);
    return {
      routes: [],
      source: 'none',
      error: err.message || 'Unable to calculate route.',
      retryable: true,
    };
  }
}

module.exports = {
  getRouteOptions,
};
