require('dotenv').config();
const { getSupabaseAdmin } = require('../lib/supabase');
const { normalizeEmail } = require('../utils/emailNormalize');
const { cityMatchesFilter } = require('../utils/metroAreas');
const { commuteMatchesRouteFilters } = require('../utils/routeMatch');
const { isCommuteOwnedByUser } = require('../utils/commuteOwnership');

function admin() {
  return getSupabaseAdmin();
}

function now() {
  return new Date().toISOString();
}

function parseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function rowToEmployee(userRow, detailsRow) {
  if (!userRow) return null;
  const d = detailsRow || userRow.user_details || {};
  const details = Array.isArray(d) ? d[0] : d;
  return {
    id: userRow.id,
    auth_id: userRow.auth_id || null,
    role: userRow.role,
    name: userRow.name,
    email: userRow.email,
    phone: userRow.phone,
    user_type: userRow.user_type,
    source: userRow.source,
    home_address: details?.home_address || '',
    office_address: details?.office_address || 'Company HQ, Bangalore',
    route_from: details?.route_from || '',
    route_to: details?.route_to || '',
    city: details?.city || 'Bangalore',
    availability: details?.availability || 'available',
    email_verified: Boolean(userRow.email_verified),
    email_notifications: userRow.email_notifications !== false,
    is_demo: Boolean(userRow.is_demo),
    bio: details?.bio || '',
    travel_preferences: details?.travel_preferences || '',
    vehicle: parseJson(details?.vehicle, null),
    recent_searches: parseJson(details?.recent_searches, []),
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
  };
}

async function fetchUserRow(filter) {
  let q = admin().from('users').select('*, user_details(*)');
  for (const [key, val] of Object.entries(filter)) {
    q = q.eq(key, val);
  }
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function findEmployeeById(id) {
  const row = await fetchUserRow({ id });
  return rowToEmployee(row);
}

async function findEmployeeByAuthId(authId) {
  const row = await fetchUserRow({ auth_id: authId });
  return rowToEmployee(row);
}

async function findEmployeeByEmail(email) {
  const row = await fetchUserRow({ email: normalizeEmail(email) });
  return rowToEmployee(row);
}

async function findEmployeeByPhone(phone) {
  const normalized = String(phone || '').replace(/\D/g, '').slice(-10);
  const row = await fetchUserRow({ phone: normalized });
  return rowToEmployee(row);
}

async function listAllEmployees({ emailNotificationsOnly = false } = {}) {
  let q = admin().from('users').select('*, user_details(*)');
  if (emailNotificationsOnly) {
    q = q.eq('email_notifications', true).eq('email_verified', true);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row) => rowToEmployee(row));
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

async function createEmployee(data) {
  const ts = now();
  const email = data.email ? normalizeEmail(data.email) : data.email;
  const phone = normalizePhoneDigits(data.phone);
  const userType = data.user_type || (data.is_demo ? 'existing' : 'new');
  const source = data.source || (data.is_demo ? 'seed' : 'register');

  const { data: userRow, error: userErr } = await admin().from('users').insert({
    auth_id: data.auth_id || null,
    email,
    phone,
    name: data.name,
    role: data.role || 'employee',
    user_type: userType,
    source,
    email_verified: Boolean(data.email_verified),
    email_notifications: data.email_notifications !== false,
    is_demo: Boolean(data.is_demo),
    created_at: ts,
    updated_at: ts,
  }).select().single();

  if (userErr) {
    if (userErr.code === '23505') {
      const err = new Error('PHONE_IN_USE');
      err.code = 'PHONE_IN_USE';
      throw err;
    }
    throw userErr;
  }

  const { error: detErr } = await admin().from('user_details').insert({
    user_id: userRow.id,
    home_address: data.home_address || '',
    office_address: data.office_address || 'Company HQ, Bangalore',
    route_from: data.route_from || '',
    route_to: data.route_to || '',
    city: data.city || 'Bangalore',
    availability: data.availability || 'available',
    bio: data.bio || '',
    travel_preferences: data.travel_preferences || '',
    vehicle: data.vehicle || null,
    recent_searches: data.recent_searches || [],
  });
  if (detErr) throw detErr;

  return findEmployeeById(userRow.id);
}

async function ensureUserDetails(id, existing) {
  const { data } = await admin().from('user_details').select('user_id').eq('user_id', id).maybeSingle();
  if (data) return;
  await admin().from('user_details').insert({
    user_id: id,
    home_address: existing.home_address || '',
    office_address: existing.office_address || 'Company HQ, Bangalore',
    route_from: existing.route_from || '',
    route_to: existing.route_to || '',
    city: existing.city || 'Bangalore',
    availability: existing.availability || 'available',
    bio: existing.bio || '',
    travel_preferences: existing.travel_preferences || '',
    vehicle: existing.vehicle || null,
    recent_searches: existing.recent_searches || [],
  });
}

async function updateEmployee(id, updates) {
  const existing = await findEmployeeById(id);
  if (!existing) return null;
  await ensureUserDetails(id, existing);

  const userFields = ['name', 'phone', 'role', 'user_type', 'source', 'email_verified', 'email_notifications', 'is_demo', 'auth_id', 'email'];
  const detailFields = [
    'home_address', 'office_address', 'route_from', 'route_to', 'city', 'availability',
    'bio', 'travel_preferences', 'vehicle', 'recent_searches',
  ];

  const userUpdates = { updated_at: now() };
  const detailUpdates = {};

  for (const [key, val] of Object.entries(updates)) {
    if (userFields.includes(key)) {
      if (key === 'email') userUpdates.email = normalizeEmail(val);
      else userUpdates[key] = val;
    } else if (detailFields.includes(key)) {
      detailUpdates[key] = val;
    }
  }

  if (userUpdates.phone) {
    userUpdates.phone = normalizePhoneDigits(userUpdates.phone);
    const other = await findEmployeeByPhone(userUpdates.phone);
    if (other && other.id !== id) {
      const err = new Error('PHONE_IN_USE');
      err.code = 'PHONE_IN_USE';
      throw err;
    }
  }

  if (Object.keys(userUpdates).length > 1) {
    const { error } = await admin().from('users').update(userUpdates).eq('id', id);
    if (error) {
      if (error.code === '23505') {
        const err = new Error('PHONE_IN_USE');
        err.code = 'PHONE_IN_USE';
        throw err;
      }
      throw error;
    }
  }

  if (Object.keys(detailUpdates).length) {
    const { error } = await admin().from('user_details').update(detailUpdates).eq('user_id', id);
    if (error) throw error;
  }

  return findEmployeeById(id);
}

async function addRecentSearch(employeeId, search) {
  const employee = await findEmployeeById(employeeId);
  if (!employee || !search?.route_from?.trim()) return null;
  const entry = {
    route_from: search.route_from.trim(),
    route_to: (search.route_to || '').trim(),
    city: (search.city || employee.city || '').trim(),
    searched_at: now(),
  };
  const list = Array.isArray(employee.recent_searches) ? employee.recent_searches : [];
  const filtered = list.filter((s) => !(
    s.route_from === entry.route_from && s.route_to === entry.route_to && (s.city || '') === entry.city
  ));
  filtered.unshift(entry);
  return updateEmployee(employeeId, { recent_searches: filtered.slice(0, 8) });
}

async function getRecentSearches(employeeId) {
  const employee = await findEmployeeById(employeeId);
  if (!employee) return [];
  return Array.isArray(employee.recent_searches) ? employee.recent_searches : [];
}

async function searchEmployees({ excludeId, city, route_from, route_to, availability }) {
  const all = await listAllEmployees();
  return all.filter((e) => {
    if (e.id === excludeId) return false;
    if (city && !cityMatchesFilter(city, e.city)) return false;
    if (route_from && route_from.length >= 2 && !(e.route_from || '').toLowerCase().includes(route_from.toLowerCase())) return false;
    if (route_to && route_to.length >= 2 && !(e.route_to || '').toLowerCase().includes(route_to.toLowerCase())) return false;
    if (availability && availability !== 'all') {
      if (e.availability !== availability) return false;
    } else if (!availability && e.availability === 'unavailable') return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function enrichRequest(request) {
  const sender = await findEmployeeById(request.sender_id);
  const receiver = await findEmployeeById(request.receiver_id);
  let commute = null;
  if (request.commute_id) {
    commute = await findCommuteById(request.commute_id);
  }
  return {
    ...request,
    sender_name: sender?.name,
    receiver_name: receiver?.name,
    sender_phone: sender?.phone,
    sender_route_from: sender?.route_from,
    sender_route_to: sender?.route_to,
    commute_route_from: commute?.route_from || null,
    commute_route_to: commute?.route_to || null,
    commute_departure_at: commute?.departure_at || null,
  };
}

async function findRequestById(id) {
  const { data } = await admin().from('carpool_requests').select('*').eq('id', id).maybeSingle();
  return data || null;
}

async function findPendingRequest(senderId, receiverId) {
  const { data } = await admin().from('carpool_requests').select('*')
    .eq('sender_id', senderId).eq('receiver_id', receiverId).eq('status', 'pending').maybeSingle();
  return data || null;
}

async function createRequest(data) {
  const ts = now();
  const { data: row, error } = await admin().from('carpool_requests').insert({
    sender_id: data.sender_id,
    receiver_id: data.receiver_id,
    commute_id: data.commute_id || null,
    status: 'pending',
    message: data.message,
    created_at: ts,
    updated_at: ts,
  }).select().single();
  if (error) throw error;
  return enrichRequest(row);
}

async function updateRequest(id, updates) {
  const { error } = await admin().from('carpool_requests').update({ ...updates, updated_at: now() }).eq('id', id);
  if (error) throw error;
  const row = await findRequestById(id);
  return row ? enrichRequest(row) : null;
}

async function deleteRequest(id) {
  const { error, count } = await admin().from('carpool_requests').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  return count > 0;
}

async function getRequests({ userId, type }) {
  let q = admin().from('carpool_requests').select('*');
  if (type === 'sent') q = q.eq('sender_id', userId);
  else if (type === 'received') q = q.eq('receiver_id', userId);
  else if (type === 'pending') q = q.eq('receiver_id', userId).eq('status', 'pending');
  else q = q.or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  const { data, error } = await q;
  if (error) throw error;
  const enriched = await Promise.all((data || []).map(enrichRequest));
  return enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function countCompletedCommutes(userId) {
  const { count, error } = await admin().from('carpool_requests').select('*', { count: 'exact', head: true })
    .eq('status', 'accepted').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (error) throw error;
  return count || 0;
}

async function attachTripIds(commutes) {
  if (!commutes?.length) return commutes;
  const ids = commutes.map((c) => c.id).filter(Boolean);
  if (!ids.length) return commutes;
  const { data, error } = await admin()
    .from('trips')
    .select('id, commute_id')
    .in('commute_id', ids)
    .in('status', ['active', 'upcoming']);
  if (error) {
    console.warn('[supabaseStore] trip_id lookup skipped:', error.message);
    return commutes;
  }
  const byCommute = new Map((data || []).map((t) => [t.commute_id, t.id]));
  return commutes.map((c) => ({
    ...c,
    trip_id: byCommute.get(c.id) ?? c.trip_id ?? null,
  }));
}

async function rowToCommute(row) {
  if (!row) return null;
  const driver = await findEmployeeById(row.driver_id);
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: driver?.name || 'Unknown',
    driver_city: driver?.city || row.city || '',
    route_from: row.route_from,
    route_to: row.route_to,
    city: row.city || driver?.city || '',
    departure_at: row.departure_at,
    seats_available: row.seats_available,
    price_per_seat: row.price_per_seat,
    notes: row.notes || '',
    stopovers: parseJson(row.stopovers, []),
    route_label: row.route_label || '',
    route_detail: row.route_detail || '',
    source_lat: row.source_lat ?? row.pickup_lat ?? null,
    source_lng: row.source_lng ?? row.pickup_lng ?? null,
    dest_lat: row.dest_lat ?? row.destination_lat ?? null,
    dest_lng: row.dest_lng ?? row.destination_lng ?? null,
    pickup_address: row.pickup_address || row.route_from || '',
    pickup_lat: row.pickup_lat ?? row.source_lat ?? null,
    pickup_lng: row.pickup_lng ?? row.source_lng ?? null,
    destination_address: row.destination_address || row.route_to || '',
    destination_lat: row.destination_lat ?? row.dest_lat ?? null,
    destination_lng: row.destination_lng ?? row.dest_lng ?? null,
    stopover_coords: parseJson(row.stopover_coords, []),
    route_polyline: row.route_polyline || null,
    route_distance_m: row.route_distance_m ?? null,
    route_duration_s: row.route_duration_s ?? null,
    distance_km: row.distance_km ?? (row.route_distance_m != null ? row.route_distance_m / 1000 : null),
    estimated_duration: row.estimated_duration ?? row.route_duration_s ?? null,
    route_type: row.route_type || '',
    toll_info: parseJson(row.toll_info, {}),
    smoking: row.smoking,
    music: row.music,
    pets: row.pets,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findCommuteById(id) {
  const { data } = await admin().from('published_commutes').select('*').eq('id', id).maybeSingle();
  return rowToCommute(data);
}

async function createCommute(data) {
  const ts = now();
  const sourceLat = data.source_lat ?? data.pickup_lat ?? null;
  const sourceLng = data.source_lng ?? data.pickup_lng ?? null;
  const destLat = data.dest_lat ?? data.destination_lat ?? null;
  const destLng = data.dest_lng ?? data.destination_lng ?? null;
  const distanceKm = data.distance_km ?? (data.route_distance_m != null ? data.route_distance_m / 1000 : null);
  const { data: row, error } = await admin().from('published_commutes').insert({
    driver_id: data.driver_id,
    route_from: data.route_from,
    route_to: data.route_to,
    city: data.city || '',
    departure_at: data.departure_at,
    seats_available: data.seats_available,
    price_per_seat: data.price_per_seat ?? 0,
    notes: data.notes || '',
    stopovers: Array.isArray(data.stopovers) ? data.stopovers : [],
    route_label: data.route_label || '',
    route_detail: data.route_detail || '',
    source_lat: sourceLat,
    source_lng: sourceLng,
    dest_lat: destLat,
    dest_lng: destLng,
    pickup_address: data.pickup_address || data.route_from,
    pickup_lat: sourceLat,
    pickup_lng: sourceLng,
    destination_address: data.destination_address || data.route_to,
    destination_lat: destLat,
    destination_lng: destLng,
    distance_km: distanceKm,
    estimated_duration: data.estimated_duration ?? data.route_duration_s ?? null,
    stopover_coords: Array.isArray(data.stopover_coords) ? data.stopover_coords : [],
    route_polyline: data.route_polyline || null,
    route_distance_m: data.route_distance_m ?? null,
    route_duration_s: data.route_duration_s ?? null,
    route_type: data.route_type || '',
    toll_info: data.toll_info && typeof data.toll_info === 'object' ? data.toll_info : {},
    smoking: data.smoking || 'not_allowed',
    music: data.music || 'any',
    pets: data.pets || 'not_allowed',
    status: 'active',
    created_at: ts,
    updated_at: ts,
  }).select().single();
  if (error) throw error;
  return findCommuteById(row.id);
}

async function updateCommute(id, updates) {
  const allowed = [
    'route_from', 'route_to', 'city', 'departure_at', 'seats_available',
    'price_per_seat', 'notes', 'stopovers', 'route_label', 'route_detail',
    'source_lat', 'source_lng', 'dest_lat', 'dest_lng', 'stopover_coords',
    'route_polyline', 'route_distance_m', 'route_duration_s', 'route_type', 'toll_info',
    'pickup_address', 'pickup_lat', 'pickup_lng', 'destination_address', 'destination_lat', 'destination_lng',
    'distance_km', 'estimated_duration',
    'smoking', 'music', 'pets', 'status',
  ];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (!Object.keys(filtered).length) return findCommuteById(id);
  filtered.updated_at = now();
  const { error } = await admin().from('published_commutes').update(filtered).eq('id', id);
  if (error) throw error;
  return findCommuteById(id);
}

async function deleteCommute(id) {
  return updateCommute(id, { status: 'cancelled' });
}

async function listCommutesByDriver(driverId, { includeCancelled = false, includeAll = false } = {}) {
  const { data, error } = await admin().from('published_commutes').select('*')
    .eq('driver_id', driverId).order('created_at', { ascending: false });
  if (error) throw error;
  const commutes = await Promise.all((data || []).map(rowToCommute));
  const withTrips = await attachTripIds(commutes);
  if (includeAll || includeCancelled) return withTrips;
  return withTrips.filter((c) => {
    const s = (c.status || 'active').toLowerCase();
    return s === 'active' || s === 'upcoming' || s === 'in_progress';
  });
}

async function expireStaleDriverCommutes(driverId) {
  const { shouldAutoComplete } = require('../utils/driverCommuteStatus');
  const commutes = await listCommutesByDriver(driverId, { includeAll: true });
  const stale = commutes.filter((c) => shouldAutoComplete(c));
  await Promise.all(stale.map((c) => updateCommute(c.id, { status: 'completed' })));
  return stale.length;
}

async function countAcceptedRequestsByCommute(commuteIds = []) {
  if (!commuteIds.length) return {};
  const { data, error } = await admin().from('carpool_requests').select('commute_id, status')
    .in('commute_id', commuteIds).eq('status', 'accepted');
  if (error) throw error;
  const counts = {};
  for (const row of data || []) {
    if (!row.commute_id) continue;
    counts[row.commute_id] = (counts[row.commute_id] || 0) + 1;
  }
  return counts;
}

async function searchCommutes({
  excludeDriverId, city, route_from, route_to, date, limit = 40,
} = {}) {
  const nowIso = now();
  const { data, error } = await admin().from('published_commutes').select('*')
    .in('status', ['active', 'upcoming'])
    .gt('seats_available', 0)
    .gte('departure_at', nowIso)
    .order('created_at', { ascending: false });
  if (error) throw error;

  let rows = (data || []).filter((row) => {
    if (excludeDriverId != null && isCommuteOwnedByUser(row, excludeDriverId)) return false;
    if (city && !cityMatchesFilter(city, row.city)) return false;
    if ((route_from || route_to) && !commuteMatchesRouteFilters(route_from, route_to, row)) return false;
    if (date) {
      const day = String(row.departure_at).slice(0, 10);
      if (day !== date) return false;
    }
    return true;
  });

  rows = rows.slice(0, limit);
  const commutes = await Promise.all(rows.map(rowToCommute));
  return attachTripIds(commutes);
}

async function createNotification(data) {
  const ts = now();
  const { data: row, error } = await admin().from('notifications').insert({
    employee_id: data.employee_id,
    type: data.type,
    title: data.title,
    message: data.message,
    related_request_id: data.related_request_id || null,
    is_read: false,
    created_at: ts,
  }).select().single();
  if (error) throw error;
  return row;
}

async function getNotifications(employeeId, { unreadOnly } = {}) {
  let q = admin().from('notifications').select('*').eq('employee_id', employeeId)
    .order('created_at', { ascending: false }).limit(50);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((n) => ({ ...n, is_read: n.is_read ? 1 : 0 }));
}

async function countUnreadNotifications(employeeId) {
  const { count, error } = await admin().from('notifications').select('*', { count: 'exact', head: true })
    .eq('employee_id', employeeId).eq('is_read', false);
  if (error) throw error;
  return count || 0;
}

async function findNotificationById(id) {
  const { data } = await admin().from('notifications').select('*').eq('id', id).maybeSingle();
  return data || null;
}

async function markNotificationRead(id) {
  await admin().from('notifications').update({ is_read: true }).eq('id', id);
  return findNotificationById(id);
}

async function markAllNotificationsRead(employeeId) {
  await admin().from('notifications').update({ is_read: true }).eq('employee_id', employeeId);
}

async function enqueueEmail({ userId, toEmail, subject, html, emailType, notificationId }) {
  const ts = now();
  const { data, error } = await admin().from('email_queue').insert({
    user_id: userId,
    to_email: toEmail,
    subject,
    html,
    email_type: emailType || 'notification',
    notification_id: notificationId || null,
    status: 'pending',
    attempts: 0,
    created_at: ts,
  }).select().single();
  if (error) throw error;
  return data;
}

async function getPendingEmails(limit = 10) {
  const { data, error } = await admin().from('email_queue').select('*')
    .eq('status', 'pending').lt('attempts', 5).order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  return data || [];
}

async function markEmailSent(id) {
  await admin().from('email_queue').update({ status: 'sent', sent_at: now(), last_error: null }).eq('id', id);
}

async function markEmailFailed(id, errorMsg) {
  const { data } = await admin().from('email_queue').select('attempts').eq('id', id).single();
  const attempts = (data?.attempts || 0) + 1;
  const status = attempts >= 5 ? 'failed' : 'pending';
  await admin().from('email_queue').update({ status, attempts, last_error: errorMsg }).eq('id', id);
}

async function markEmailSkipped(id, reason) {
  await admin().from('email_queue').update({ status: 'skipped', last_error: reason, sent_at: now() }).eq('id', id);
}

async function getEmailQueueStats() {
  const { data, error } = await admin().from('email_queue').select('status');
  if (error) throw error;
  const stats = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of data || []) stats[r.status] = (stats[r.status] || 0) + 1;
  return stats;
}

async function getRecentEmailDeliveries(limit = 20) {
  const { data, error } = await admin().from('email_queue').select(
    'id, user_id, to_email, subject, email_type, status, attempts, last_error, created_at, sent_at'
  ).order('id', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

async function createNotificationFeedback({ userId, notificationId, emailQueueId, rating, comment }) {
  const ts = now();
  const { data, error } = await admin().from('notification_feedback').insert({
    user_id: userId,
    notification_id: notificationId || null,
    email_queue_id: emailQueueId || null,
    rating: rating || null,
    comment: comment || '',
    created_at: ts,
  }).select().single();
  if (error) throw error;
  return data;
}

async function getFeedbackSummary() {
  const { data: ratings } = await admin().from('notification_feedback').select('rating').not('rating', 'is', null);
  const total = ratings?.length || 0;
  const avg = total ? ratings.reduce((s, r) => s + r.rating, 0) / total : null;
  const { data: recent } = await admin().from('notification_feedback').select('*, users(name, email)')
    .order('created_at', { ascending: false }).limit(20);
  return {
    avgRating: avg ? Math.round(avg * 10) / 10 : null,
    total,
    recent: recent || [],
  };
}

async function saveOtp(data) {
  await admin().from('otps').delete().eq('identifier', data.identifier)
    .eq('channel', data.channel).eq('purpose', data.purpose);
  const { error } = await admin().from('otps').insert({
    identifier: data.identifier,
    channel: data.channel,
    purpose: data.purpose,
    code: data.code,
    expires_at: data.expires_at,
    attempts: 0,
    created_at: now(),
  });
  if (error) throw error;
  return data;
}

async function findOtp(identifier, channel, purpose) {
  const { data } = await admin().from('otps').select('*')
    .eq('identifier', identifier).eq('channel', channel).eq('purpose', purpose).maybeSingle();
  return data || null;
}

async function deleteOtp(identifier, channel, purpose) {
  await admin().from('otps').delete().eq('identifier', identifier)
    .eq('channel', channel).eq('purpose', purpose);
}

async function incrementOtpAttempts(identifier, channel, purpose) {
  const row = await findOtp(identifier, channel, purpose);
  if (!row) return;
  await admin().from('otps').update({ attempts: (row.attempts || 0) + 1 })
    .eq('identifier', identifier).eq('channel', channel).eq('purpose', purpose);
}

async function countRecentOtps(identifier, sinceMinutes = 10) {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  const { count } = await admin().from('otps').select('*', { count: 'exact', head: true })
    .eq('identifier', identifier).gt('created_at', cutoff);
  return count || 0;
}

async function createVerificationToken(identifier, channel, purpose) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  await admin().from('verification_tokens').delete().eq('identifier', identifier);
  await admin().from('verification_tokens').insert({
    token,
    identifier,
    channel,
    purpose,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    created_at: now(),
  });
  return token;
}

async function consumeVerificationToken(token, purpose) {
  const ts = now();
  const { data } = await admin().from('verification_tokens').select('*')
    .eq('token', token).eq('purpose', purpose).gt('expires_at', ts).maybeSingle();
  if (!data) return null;
  await admin().from('verification_tokens').delete().eq('token', token);
  return data;
}

async function resetStore() {
  const tables = [
    'notification_feedback', 'email_queue', 'notifications', 'carpool_requests',
    'published_commutes', 'live_locations', 'user_details', 'users', 'otps', 'verification_tokens',
  ];
  for (const t of tables) {
    await admin().from(t).delete().neq('id', 0).catch(() => admin().from(t).delete().neq('user_id', 0));
  }
}

// Live locations (Supabase-backed)
async function upsertLiveLocation(userId, data) {
  const { error } = await admin().from('live_locations').upsert({
    user_id: userId,
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy ?? null,
    city: data.city ?? null,
    route_from: data.route_from ?? null,
    name: data.name ?? null,
    updated_at: now(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

async function removeLiveLocation(userId) {
  await admin().from('live_locations').delete().eq('user_id', userId);
}

async function listLiveLocations({ city, excludeUserId, maxAgeMs = 5 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  let q = admin().from('live_locations').select('*').gt('updated_at', cutoff);
  if (city) q = q.eq('city', city);
  const { data, error } = await q;
  if (error) throw error;
  return (data || [])
    .filter((r) => r.user_id !== excludeUserId)
    .map((r) => ({
      userId: r.user_id,
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      city: r.city,
      route_from: r.route_from,
      name: r.name,
      updatedAt: new Date(r.updated_at).getTime(),
    }));
}

function getDbPath() {
  return process.env.SUPABASE_URL || 'supabase';
}

async function countTable(table, { filter } = {}) {
  let q = admin().from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function getPlatformStats() {
  try {
    const [
      members,
      activeRides,
      completedRides,
      totalPublished,
      carpoolsMatched,
      pendingRequests,
      cityRows,
      seatRows,
    ] = await Promise.all([
      countTable('users'),
      countTable('published_commutes', {
        filter: (q) => q.in('status', ['active', 'upcoming']),
      }),
      countTable('published_commutes', {
        filter: (q) => q.eq('status', 'completed'),
      }),
      countTable('published_commutes'),
      countTable('carpool_requests', {
        filter: (q) => q.eq('status', 'accepted'),
      }),
      countTable('carpool_requests', {
        filter: (q) => q.eq('status', 'pending'),
      }),
      admin().from('users').select('city').not('city', 'is', null).neq('city', ''),
      admin().from('published_commutes').select('seats_available').in('status', ['active', 'upcoming']),
    ]);

    const seatsAvailable = (seatRows.data || []).reduce(
      (sum, row) => sum + (row.seats_available || 0),
      0,
    );
    const citySet = new Set(
      (cityRows.data || []).map((r) => (r.city || '').trim()).filter(Boolean),
    );

    return {
      members,
      active_rides: activeRides,
      completed_rides: completedRides,
      total_published: totalPublished,
      carpools_matched: carpoolsMatched,
      pending_requests: pendingRequests,
      seats_available: seatsAvailable,
      cities: citySet.size,
      updated_at: now(),
    };
  } catch (err) {
    console.error('[getPlatformStats]', err.message);
    return {
      members: 0,
      active_rides: 0,
      completed_rides: 0,
      total_published: 0,
      carpools_matched: 0,
      pending_requests: 0,
      seats_available: 0,
      cities: 0,
      updated_at: now(),
    };
  }
}

module.exports = {
  resetStore,
  normalizeEmail,
  findEmployeeById,
  findEmployeeByAuthId,
  findEmployeeByEmail,
  findEmployeeByPhone,
  listAllEmployees,
  createEmployee,
  updateEmployee,
  addRecentSearch,
  getRecentSearches,
  searchEmployees,
  findRequestById,
  findPendingRequest,
  createRequest,
  updateRequest,
  deleteRequest,
  getRequests,
  countCompletedCommutes,
  findCommuteById,
  createCommute,
  updateCommute,
  deleteCommute,
  listCommutesByDriver,
  expireStaleDriverCommutes,
  countAcceptedRequestsByCommute,
  searchCommutes,
  createNotification,
  getNotifications,
  countUnreadNotifications,
  findNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  enqueueEmail,
  getPendingEmails,
  markEmailSent,
  markEmailFailed,
  markEmailSkipped,
  getEmailQueueStats,
  getRecentEmailDeliveries,
  createNotificationFeedback,
  getFeedbackSummary,
  saveOtp,
  findOtp,
  deleteOtp,
  incrementOtpAttempts,
  countRecentOtps,
  createVerificationToken,
  consumeVerificationToken,
  upsertLiveLocation,
  removeLiveLocation,
  listLiveLocations,
  getDbPath,
  getPlatformStats,
};
