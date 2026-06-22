require('dotenv').config();

const { isSupabaseConfigured } = require('./lib/supabase');

function wrapSyncStore(syncStore) {
  const wrapped = {};
  for (const [key, val] of Object.entries(syncStore)) {
    if (typeof val === 'function') {
      wrapped[key] = (...args) => Promise.resolve(val(...args));
    } else {
      wrapped[key] = val;
    }
  }
  return wrapped;
}

if (isSupabaseConfigured()) {
  module.exports = require('./db/supabaseStore');
} else {
  module.exports = wrapSyncStore(require('./db/store'));
}

module.exports.isSupabase = isSupabaseConfigured;
