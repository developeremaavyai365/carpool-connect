require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

let adminClient = null;
let anonClient = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || '';
}

function getSupabaseAdmin() {
  if (!adminClient) {
    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

function getSupabaseAnon() {
  if (!anonClient) {
    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    }
    anonClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}

function isSupabaseConfigured() {
  return Boolean(
    getSupabaseUrl()
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.SUPABASE_ANON_KEY
  );
}

module.exports = {
  getSupabaseAdmin,
  getSupabaseAnon,
  isSupabaseConfigured,
  getSupabaseUrl,
};
