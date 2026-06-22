const PROFILE_FIELDS = [
  { key: 'name', label: 'Add your name', check: (e) => !!(e.name?.trim()?.length >= 2) },
  { key: 'phone', label: 'Add phone number', check: (e) => /^[6-9]\d{9}$/.test(e.phone || '') },
  { key: 'email_verified', label: 'Verify email address', check: (e) => !!e.email_verified },
  { key: 'route_from', label: 'Set pickup location', check: (e) => !!(e.route_from?.trim()?.length >= 2) },
  { key: 'route_to', label: 'Set drop location', check: (e) => !!(e.route_to?.trim()?.length >= 2) },
  { key: 'bio', label: 'Add a mini bio', check: (e) => !!(e.bio?.trim()?.length >= 10) },
];

function withEmployeeDefaults(employee) {
  if (!employee) return null;
  return {
    ...employee,
    bio: employee.bio || '',
    travel_preferences: employee.travel_preferences || '',
    vehicle: employee.vehicle || null,
    recent_searches: Array.isArray(employee.recent_searches) ? employee.recent_searches : [],
    phone_verified: !!employee.phone_verified,
  };
}

function computeProfileCompletion(employee) {
  const e = withEmployeeDefaults(employee);
  const checks = PROFILE_FIELDS.map(({ key, label, check }) => ({
    key,
    label,
    done: check(e),
  }));
  const completed = checks.filter((c) => c.done).length;
  const total = checks.length;
  const nextStep = checks.find((c) => !c.done) || null;
  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
    checks,
    nextStep: nextStep?.label || null,
    memberLevel: completed >= 5 ? 'Trusted commuter' : completed >= 3 ? 'Regular member' : 'New member',
  };
}

function verificationStatus(employee) {
  const e = withEmployeeDefaults(employee);
  return [
    { key: 'email', label: 'Email verified', value: e.email, verified: !!e.email_verified },
    { key: 'phone', label: 'Phone on file', value: e.phone ? `+91${e.phone}` : null, verified: !!e.phone },
    { key: 'member', label: 'Verified member', value: e.email, verified: !!e.email_verified },
  ].filter((item) => item.value);
}

module.exports = {
  withEmployeeDefaults,
  computeProfileCompletion,
  verificationStatus,
};
