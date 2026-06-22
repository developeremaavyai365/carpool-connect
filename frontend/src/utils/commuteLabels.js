export const SMOKING_OPTIONS = [
  { value: 'not_allowed', label: 'No smoking', icon: '🚭' },
  { value: 'occasionally', label: 'Occasional breaks OK', icon: '🚬' },
  { value: 'allowed', label: 'Smoking allowed', icon: '✓' },
];

export const MUSIC_OPTIONS = [
  { value: 'any', label: 'Any music', icon: '🎵' },
  { value: 'background', label: 'Background music', icon: '🔊' },
  { value: 'quiet', label: 'Quiet ride', icon: '🤫' },
  { value: 'no_music', label: 'No music', icon: '🔇' },
];

export const PETS_OPTIONS = [
  { value: 'not_allowed', label: 'No pets', icon: '🐾' },
  { value: 'allowed', label: 'Pets welcome', icon: '🐕' },
];

export const WIZARD_STEPS = [
  { id: 'itinerary', label: 'From / To' },
  { id: 'stopovers', label: 'Stops' },
  { id: 'route', label: 'Route' },
  { id: 'schedule', label: 'When' },
  { id: 'seats', label: 'Seats' },
  { id: 'preferences', label: 'Prefs' },
  { id: 'review', label: 'Publish' },
];

export function labelFor(value, options) {
  return options.find((o) => o.value === value)?.label || value;
}

export function formatDeparture(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPublishedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPrice(amount) {
  const n = Number(amount);
  if (!n) return 'Free';
  return `₹${n % 1 === 0 ? n : n.toFixed(0)}`;
}

export function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function defaultDepartureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

export function defaultDepartureTime() {
  return '08:30';
}

export function normalizeTimeHHMM(timeStr) {
  if (!timeStr) return '';
  const m = String(timeStr).trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return m ? `${m[1]}:${m[2]}` : String(timeStr).trim().slice(0, 5);
}

export function isDepartureInFuture(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const normalized = normalizeTimeHHMM(timeStr);
  const [y, mo, day] = dateStr.split('-').map(Number);
  const [h, mi] = normalized.split(':').map(Number);
  const dep = new Date(y, mo - 1, day, h, mi, 0, 0);
  return dep.getTime() >= Date.now() + 60 * 1000;
}

export function commuteToForm(commute) {
  if (!commute) return null;
  const d = new Date(commute.departure_at);
  return {
    route_from: commute.route_from,
    route_to: commute.route_to,
    city: commute.city || '',
    departure_date: toLocalDateString(d),
    departure_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    seats_available: commute.seats_available,
    price_per_seat: commute.price_per_seat,
    notes: commute.notes || '',
    stopovers: Array.isArray(commute.stopovers) ? commute.stopovers : [],
    selectedRouteId: 'recommended',
    route_label: commute.route_label || '',
    route_detail: commute.route_detail || '',
    smoking: commute.smoking || 'not_allowed',
    music: commute.music || 'any',
    pets: commute.pets || 'not_allowed',
  };
}

export function emptyCommuteForm(user) {
  return {
    route_from: user?.route_from || '',
    route_to: user?.route_to || '',
    city: user?.city || '',
    departure_date: defaultDepartureDate(),
    departure_time: defaultDepartureTime(),
    seats_available: 3,
    price_per_seat: 0,
    notes: '',
    stopovers: [],
    selectedRouteId: 'recommended',
    route_label: '',
    route_detail: '',
    smoking: 'not_allowed',
    music: 'any',
    pets: 'not_allowed',
  };
}
