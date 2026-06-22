/** NCR and other metro clusters for search + route matching */

const NCR_CITIES = new Set(['Delhi', 'Noida', 'Gurgaon', 'Faridabad', 'Ghaziabad']);

function normalizeCity(city) {
  return (city || '').trim();
}

function citiesInSameMetro(a, b) {
  const na = normalizeCity(a);
  const nb = normalizeCity(b);
  if (!na || !nb) return false;
  if (na.toLowerCase() === nb.toLowerCase()) return true;
  if (NCR_CITIES.has(na) && NCR_CITIES.has(nb)) return true;
  return false;
}

function cityMatchesFilter(filterCity, employeeCity) {
  if (!filterCity) return true;
  if (!employeeCity) return false;
  return citiesInSameMetro(filterCity, employeeCity)
    || filterCity.toLowerCase() === employeeCity.toLowerCase();
}

module.exports = {
  NCR_CITIES,
  normalizeCity,
  citiesInSameMetro,
  cityMatchesFilter,
};
