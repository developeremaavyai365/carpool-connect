/** Consistent user-id comparison (Supabase may return string or number). */
function isSameUserId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function isCommuteOwnedByUser(commute, userId) {
  if (!commute || userId == null) return false;
  return isSameUserId(commute.driver_id, userId);
}

module.exports = { isSameUserId, isCommuteOwnedByUser };
