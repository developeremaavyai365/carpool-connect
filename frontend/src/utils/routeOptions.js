/** Stopover suggestions for publish wizard (labels only — routes come from routing API). */

const NCR_STOPOVERS = [
  'North East Delhi', 'West Delhi', 'North Delhi', 'South Delhi',
  'East Delhi', 'Central Delhi', 'Gurgaon', 'Noida', 'Faridabad',
  'Ghaziabad', 'Sonipat', 'Baghpat', 'Indirapuram', 'Dwarka', 'Rohini',
  'Manesar', 'Neemrana', 'Jaipur',
];

function normalizeKey(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function suggestStopovers(routeFrom, routeTo, selected = []) {
  const text = `${routeFrom} ${routeTo}`.toLowerCase();
  const picked = new Set(selected.map(normalizeKey));
  const endpoints = new Set([normalizeKey(routeFrom), normalizeKey(routeTo)]);

  const ranked = NCR_STOPOVERS
    .filter((name) => {
      const n = name.toLowerCase();
      return !picked.has(n) && !endpoints.has(n);
    })
    .map((name) => {
      const n = name.toLowerCase();
      let score = 0;
      if (text.includes('delhi') && n.includes('delhi')) score += 3;
      if (text.includes('jaipur') && (n.includes('neemrana') || n.includes('gurgaon'))) score += 3;
      if (text.includes('sonipat') && (n.includes('delhi') || n === 'baghpat')) score += 3;
      if (text.includes('noida') && (n.includes('delhi') || n.includes('noida'))) score += 2;
      if (text.includes('gurgaon') && (n.includes('delhi') || n.includes('gurgaon') || n.includes('manesar'))) score += 2;
      if (text.includes('ghaziabad') && (n.includes('delhi') || n.includes('ghaziabad'))) score += 2;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked.filter((r) => r.score > 0).slice(0, 6).map((r) => r.name);
  if (top.length >= 4) return top;
  return ranked.slice(0, 6).map((r) => r.name);
}
