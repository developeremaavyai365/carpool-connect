/** Consistent user-id comparison (API may return string or number). */
export function isSameUserId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

export function isCommuteOwnedByUser(commute, userId) {
  if (!commute || userId == null) return false;
  return isSameUserId(commute.driver_id, userId);
}
