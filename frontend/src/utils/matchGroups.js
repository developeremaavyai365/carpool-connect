/** Group geospatial search results by match type for browse UI */
export function groupCommutesByMatchType(commutes = []) {
  const groups = { exact: [], nearby: [], recommended: [], other: [] };
  for (const c of commutes) {
    if (!c.geospatial || !c.match_type) {
      groups.other.push(c);
      continue;
    }
    if (groups[c.match_type]) groups[c.match_type].push(c);
    else groups.other.push(c);
  }
  return groups;
}

export function hasGeospatialGroups(commutes = []) {
  return commutes.some((c) => c.geospatial && c.match_type);
}
