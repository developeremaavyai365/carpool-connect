/** Single email normalizer — lowercase + trim only (preserves Gmail dots/plus tags). */
function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

module.exports = { normalizeEmail };
