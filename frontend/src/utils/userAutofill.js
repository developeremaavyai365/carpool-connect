const STORAGE_KEY = 'carpool_user_autofill';
const LEGACY_EMAIL_KEY = 'lastLoginEmail';

function loadRaw() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!data.email) {
      const legacy = localStorage.getItem(LEGACY_EMAIL_KEY);
      if (legacy) data.email = legacy;
    }
    return data;
  } catch {
    return {};
  }
}

export function loadStoredAutofill() {
  return loadRaw();
}

export function saveStoredAutofill(partial) {
  if (!partial || typeof partial !== 'object') return;
  const cleaned = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v != null && v !== '')
  );
  if (!Object.keys(cleaned).length) return;
  const next = { ...loadRaw(), ...cleaned };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (next.email) {
    localStorage.setItem(LEGACY_EMAIL_KEY, next.email);
  }
}

export function loginFormDefaults() {
  const s = loadRaw();
  return { email: s.email || '' };
}

export function registerFormDefaults() {
  const s = loadRaw();
  return {
    name: s.name || '',
    email: s.email || '',
    phone: s.phone || '',
    password: '',
    confirmPassword: '',
  };
}

export function syncUserToAutofill(user) {
  if (!user) return;
  const raw = loadRaw();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...raw,
    email: user.email,
    name: user.name ?? '',
    phone: user.phone ?? '',
    home_address: user.home_address ?? '',
    office_address: user.office_address ?? '',
    route_from: user.route_from ?? '',
    route_to: user.route_to ?? '',
    city: user.city ?? raw.city,
    availability: user.availability ?? 'available',
  }));
  if (user.email) {
    localStorage.setItem(LEGACY_EMAIL_KEY, user.email);
  }
}

export function filtersFromUser(user, overrides = {}) {
  const s = loadRaw();
  const base = {
    city: user?.city || s.city || '',
    route_from: user?.route_from || s.route_from || '',
    route_to: user?.route_to || s.route_to || user?.office_address || s.office_address || '',
    availability: user?.availability === 'unavailable'
      ? (s.availability === 'unavailable' ? '' : (s.availability || ''))
      : (user?.availability || s.availability || ''),
    match: false,
  };
  return {
    ...base,
    ...overrides,
    route_from: overrides.route_from ?? base.route_from,
    route_to: overrides.route_to ?? base.route_to,
    city: overrides.city ?? base.city,
  };
}

export function profileFromUser(user) {
  const s = loadRaw();
  if (!user) {
    return {
      name: s.name || '',
      phone: s.phone || '',
      home_address: s.home_address || '',
      office_address: s.office_address || '',
      route_from: s.route_from || '',
      route_to: s.route_to || '',
      city: s.city || 'Bangalore',
      availability: s.availability || 'available',
      bio: '',
      travel_preferences: '',
      vehicle: null,
    };
  }
  return {
    name: user.name || '',
    phone: user.phone || '',
    home_address: user.home_address || '',
    office_address: user.office_address || '',
    route_from: user.route_from || '',
    route_to: user.route_to || '',
    city: user.city || 'Bangalore',
    availability: user.availability || 'available',
    bio: user.bio || '',
    travel_preferences: user.travel_preferences || '',
    vehicle: user.vehicle || null,
    email_notifications: user.email_notifications !== false,
  };
}

export function saveSearchFilters(filters) {
  saveStoredAutofill({
    city: filters.city,
    route_from: filters.route_from,
    route_to: filters.route_to,
    availability: filters.availability,
  });
}

export function areaLabel(area) {
  if (!area) return '';
  const parts = [area.route_from, area.city].filter(Boolean);
  return parts.length ? parts.join(', ') : area.city || 'your area';
}

export function defaultPoolMessage(user, employee) {
  const s = loadRaw();
  const from = user?.route_from || s.route_from;
  const to = user?.route_to || s.route_to;
  const first = employee.name.split(' ')[0];
  if (from && to) {
    return `Hi ${first}! I commute from ${from} to ${to}. Would you like to carpool together?`;
  }
  return `Hi ${first}! I noticed we share a similar route in ${employee.city}. Would you like to carpool?`;
}

export function lastPoolMessage() {
  return loadRaw().poolMessage || '';
}

export function savePoolMessage(message) {
  if (message?.trim()) saveStoredAutofill({ poolMessage: message.trim() });
}
