/** CORS rules — LAN, configured URLs, and common tunnel hosts. */

const TUNNEL_ORIGIN_PATTERNS = [
  /^https?:\/\/[\w-]+\.ngrok-free\.app(:\d+)?$/,
  /^https?:\/\/[\w-]+\.ngrok\.io(:\d+)?$/,
  /^https?:\/\/[\w-]+\.trycloudflare\.com(:\d+)?$/,
  /^https?:\/\/[\w-]+\.loca\.lt(:\d+)?$/,
  /^https?:\/\/[\w-]+\.localtunnel\.me(:\d+)?$/,
  /^https?:\/\/[\w-]+\.serveo\.net(:\d+)?$/,
];

const LAN_ORIGIN_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/169\.254\.\d{1,3}\.\d{1,3}(:\d+)?$/,
];

function configuredOrigins() {
  const raw = [
    process.env.PUBLIC_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (process.env.CORS_ALLOW_ALL === 'true') return true;

  const normalized = origin.replace(/\/$/, '');
  if (configuredOrigins().includes(normalized)) return true;

  if (TUNNEL_ORIGIN_PATTERNS.some((p) => p.test(normalized))) return true;
  if (LAN_ORIGIN_PATTERNS.some((p) => p.test(normalized))) return true;

  return false;
}

function corsOptions() {
  return {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
  };
}

module.exports = { isAllowedOrigin, corsOptions, configuredOrigins };
