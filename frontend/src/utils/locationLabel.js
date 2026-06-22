/** Precise pickup label from reverse-geocoded map data. */
export function locationLabelForFrom(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.trim();

  if (data.home_address && data.home_address.length > 2) {
    return data.home_address.trim();
  }
  if (data.route_from && data.route_from.length > 2) {
    return data.route_from.trim();
  }
  if (data.full_address) {
    const parts = data.full_address.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2).join(', ');
    return data.full_address.trim();
  }
  return '';
}

/** Precise drop-off label from reverse-geocoded map data. */
export function locationLabelForDrop(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.trim();

  if (data.full_address) {
    const parts = data.full_address.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) return parts.slice(0, 3).join(', ');
    if (parts.length >= 1) return parts.slice(0, 2).join(', ');
    return data.full_address.trim();
  }
  return locationLabelForFrom(data);
}

export function cityFromLocation(data) {
  if (!data || typeof data === 'string') return '';
  return data.city || '';
}
