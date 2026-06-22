const { citiesInSameMetro } = require('./metroAreas');

const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai',
  'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Chandigarh', 'Kochi', 'Indore', 'Nagpur', 'Gurgaon',
  'Noida', 'Faridabad', 'Ghaziabad', 'Thane', 'Visakhapatnam', 'Bhopal', 'Coimbatore',
];

function normalize(text) {
  return (text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function tokenizeRoute(route) {
  return normalize(route)
    .split(/[,>\-–→]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function routeMatchScore(employee, candidate) {
  let score = 0;

  if (citiesInSameMetro(employee.city, candidate.city)) {
    score += 40;
  } else if (normalize(employee.city) === normalize(candidate.city)) {
    score += 40;
  }

  const empFrom = tokenizeRoute(employee.route_from);
  const empTo = tokenizeRoute(employee.route_to);
  const candFrom = tokenizeRoute(candidate.route_from);
  const candTo = tokenizeRoute(candidate.route_to);

  score += jaccardSimilarity(new Set(empFrom), new Set(candFrom)) * 30;
  score += jaccardSimilarity(new Set(empTo), new Set(candTo)) * 30;

  if (normalize(employee.route_from) === normalize(candidate.route_from)) score += 15;
  if (normalize(employee.route_to) === normalize(candidate.route_to)) score += 15;

  if (candidate.availability === 'available') score += 10;
  else if (candidate.availability === 'limited') score += 5;

  return Math.min(100, Math.round(score));
}

function findMatches(employee, candidates, { minScore = 30, limit = 20 } = {}) {
  return candidates
    .filter((c) => c.id !== employee.id)
    .map((candidate) => ({
      ...candidate,
      matchScore: routeMatchScore(employee, candidate),
    }))
    .filter((c) => c.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

function sanitizeEmployee(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return {
    ...safe,
    bio: safe.bio || '',
    travel_preferences: safe.travel_preferences || '',
    vehicle: safe.vehicle || null,
    recent_searches: Array.isArray(safe.recent_searches) ? safe.recent_searches : [],
    phone_verified: !!safe.phone_verified,
    email_notifications: safe.email_notifications !== false,
    user_type: safe.user_type || (safe.is_demo ? 'existing' : 'new'),
    source: safe.source || 'register',
  };
}

module.exports = {
  INDIAN_CITIES,
  normalize,
  routeMatchScore,
  findMatches,
  sanitizeEmployee,
};
