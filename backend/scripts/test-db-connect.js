require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const dns = require('dns');

const ref = 'rejqxwtyisasykblbvyy';
const pass = process.env.SUPABASE_DB_PASSWORD;

const regions = [
  'ap-south-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-northeast-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1', 'us-east-1', 'us-west-1',
  'us-west-2', 'ca-central-1', 'sa-east-1',
];

const prefixes = ['aws-0', 'aws-1'];

function buildUrls() {
  const list = [];
  for (const prefix of prefixes) {
    for (const region of regions) {
      for (const port of [6543, 5432]) {
        list.push([
          `${prefix}-${region}-${port}`,
          `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@${prefix}-${region}.pooler.supabase.com:${port}/postgres`,
        ]);
      }
    }
  }
  list.push([
    'direct-ipv6-lookup',
    `postgresql://postgres:${encodeURIComponent(pass)}@db.${ref}.supabase.co:5432/postgres`,
    { lookup: (hostname, opts, cb) => dns.lookup(hostname, { family: 6, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const addr = Array.isArray(addrs) ? addrs[0]?.address : addrs;
      cb(null, addr, 6);
    }) },
  ]);
  return list;
}

(async () => {
  for (const entry of buildUrls()) {
    const [name, url, extra] = entry;
    const c = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      ...(extra || {}),
    });
    try {
      await c.connect();
      await c.query('select 1');
      console.log('SUCCESS', name, url.replace(encodeURIComponent(pass), '***'));
      await c.end();
      process.exit(0);
    } catch (e) {
      const msg = e.message.split('\n')[0];
      if (!msg.includes('tenant/user') && !msg.includes('ENOTFOUND') && !msg.includes('ENETUNREACH')) {
        console.log('INTERESTING', name, msg);
      }
    } finally {
      try { await c.end(); } catch { /* ignore */ }
    }
  }
  console.log('No connection worked');
  process.exit(1);
})();
