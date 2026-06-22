/** Map API user → editable profile form state. */
export function formStateFromUser(user) {
  if (!user) return null;
  const vehicle = user.vehicle || null;
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
    vehicle: vehicle
      ? {
          make: vehicle.make || '',
          model: vehicle.model || '',
          color: vehicle.color || '',
          seats: vehicle.seats != null ? String(vehicle.seats) : '',
        }
      : { make: '', model: '', color: '', seats: '' },
    email_notifications: user.email_notifications !== false,
  };
}

/** Build a clean PUT payload (normalized phone, trimmed fields). */
export function buildProfilePayload(form) {
  const phone = String(form.phone || '').replace(/\D/g, '').slice(-10);

  let vehicle = null;
  const v = form.vehicle || {};
  const make = (v.make || '').trim();
  const model = (v.model || '').trim();
  if (make || model) {
    vehicle = {
      make,
      model,
      color: (v.color || '').trim(),
      ...(v.seats !== '' && v.seats != null
        ? { seats: parseInt(String(v.seats), 10) || undefined }
        : {}),
    };
  }

  return {
    name: (form.name || '').trim(),
    phone,
    home_address: (form.home_address || '').trim(),
    office_address: (form.office_address || '').trim(),
    route_from: (form.route_from || '').trim(),
    route_to: (form.route_to || '').trim(),
    city: form.city || 'Bangalore',
    availability: form.availability || 'available',
    bio: (form.bio || '').trim(),
    travel_preferences: (form.travel_preferences || '').trim(),
    vehicle,
    email_notifications: form.email_notifications !== false,
  };
}

export function profileSummary(user) {
  if (!user) return {};
  const route = [user.route_from, user.route_to].filter(Boolean).join(' → ');
  const vehicle = user.vehicle?.make
    ? [user.vehicle.make, user.vehicle.model].filter(Boolean).join(' ')
    : '';
  return {
    name: user.name || '',
    bio: user.bio?.trim() || '',
    travel_preferences: user.travel_preferences?.trim() || '',
    route,
    city: user.city || '',
    availability: user.availability || 'available',
    vehicle,
  };
}
