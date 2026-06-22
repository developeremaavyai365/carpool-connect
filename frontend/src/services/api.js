const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(parseApiError(data, res.status), res.status, data);
  }

  return data;
}

function parseApiError(data, status) {
  const validationMsg = Array.isArray(data.errors)
    ? data.errors.map((e) => e.msg).filter(Boolean).join('. ')
    : '';

  const raw = data.error ?? data.message;
  if (typeof raw === 'string' && raw.trim() && raw.trim() !== '{}') return raw.trim();
  if (typeof raw === 'object' && raw?.message && raw.message !== '{}') return String(raw.message);

  if (validationMsg) return validationMsg;
  if (status === 504) return 'The server timed out. Please try again in a moment.';
  if (status === 502) return 'Could not complete the request. Please try again.';
  return 'Request failed';
}

export const authApi = {
  sendOtp: (body) => request('/auth/otp/send', { method: 'POST', body: JSON.stringify(body) }),
  verifyLoginOtp: (body) => request('/auth/otp/verify-login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
};

export const employeeApi = {
  getProfile: () => request('/employees/profile'),
  updateProfile: (body) => request('/employees/profile', { method: 'PUT', body: JSON.stringify(body) }),
  getProfileCompletion: () => request('/employees/profile/completion'),
  getRecentSearches: () => request('/employees/recent-searches'),
  saveRecentSearch: (body) =>
    request('/employees/recent-searches', { method: 'POST', body: JSON.stringify(body) }),
  search: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/employees/search?${qs}`);
  },
  getRecommendations: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/employees/recommendations${qs ? `?${qs}` : ''}`);
  },
  getById: (id) => request(`/employees/${id}`),
  getCities: () => request('/employees/cities'),
};

export const requestApi = {
  getAll: (type) => request(`/requests${type ? `?type=${type}` : ''}`),
  getPending: () => request('/requests/pending'),
  getCompletedCount: () => request('/requests/completed-count'),
  create: (body) => request('/requests', { method: 'POST', body: JSON.stringify(body) }),
  respond: (id, response) =>
    request(`/requests/${id}/respond`, { method: 'PATCH', body: JSON.stringify({ response }) }),
  cancel: (id) => request(`/requests/${id}`, { method: 'DELETE' }),
};

export const commuteApi = {
  search: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return request(`/commutes/search${qs ? `?${qs}` : ''}`);
  },
  getMine: () => request('/commutes/mine'),
  getRoutes: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/commutes/routes?${qs}`);
  },
  calculateRoutes: (body) =>
    request('/commutes/routes/calculate', { method: 'POST', body: JSON.stringify(body) }),
  complete: (id) => request(`/commutes/${id}/complete`, { method: 'PATCH' }),
  getById: (id) => request(`/commutes/${id}`),
  create: (body) => request('/commutes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/commutes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id) => request(`/commutes/${id}`, { method: 'DELETE' }),
};

export const notificationApi = {
  getAll: (unread) => request(`/notifications${unread ? '?unread=true' : ''}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  submitFeedback: (body) => request('/notifications/feedback', { method: 'POST', body: JSON.stringify(body) }),
  getEmailStatus: () => request('/notifications/email-status'),
};

export const locationApi = {
  mapsConfig: () => request('/location/maps-config'),
  autocomplete: (q, { city, lat, lng } = {}) => {
    const params = new URLSearchParams({ q });
    if (city) params.set('city', city);
    if (lat != null) params.set('lat', lat);
    if (lng != null) params.set('lng', lng);
    return request(`/location/autocomplete?${params}`);
  },
  distanceMatrix: (origins, destinations) => request('/location/distance', {
    method: 'POST',
    body: JSON.stringify({ origins, destinations }),
  }),
  reverse: (lat, lng) => request(`/location/reverse?lat=${lat}&lng=${lng}`),
  search: (q, city) => {
    const params = new URLSearchParams({ q });
    if (city) params.set('city', city);
    return request(`/location/search?${params}`);
  },
  update: (body) => request('/location/update', { method: 'POST', body: JSON.stringify(body) }),
  nearby: ({ lat, lng, city }) => {
    const params = new URLSearchParams();
    if (lat != null) params.set('lat', lat);
    if (lng != null) params.set('lng', lng);
    if (city) params.set('city', city);
    return request(`/location/nearby?${params}`);
  },
  getCities: () => request('/location/cities'),
};

export const platformApi = {
  getStats: () => request('/platform/stats'),
};

/** PostGIS corridor search + geospatial trip publish/book (BlaBlaCar-style) */
export const ridesApi = {
  matchingConfig: () => request('/rides/matching-config'),
  search: (params) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')),
    ).toString();
    return request(`/rides/search?${qs}`);
  },
  publish: (body) => request('/rides', { method: 'POST', body: JSON.stringify(body) }),
  getById: (id) => request(`/rides/${id}`),
  book: (body) => request('/rides/book', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id) => request(`/rides/${id}`, { method: 'DELETE' }),
  myBookings: () => request('/rides/bookings/mine'),
  driverBookings: () => request('/rides/bookings/driver'),
  cancelBooking: (id) => request(`/rides/bookings/${id}`, { method: 'DELETE' }),
  createReview: (body) => request('/rides/reviews', { method: 'POST', body: JSON.stringify(body) }),
  myReviews: () => request('/rides/reviews/mine'),
};

export { ApiError };
