const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..', '..', '..');
const backendRoot = path.join(__dirname, '..', '..');

function readPublicUrlFile() {
  const candidates = [
    path.join(projectRoot, '.public-url'),
    path.join(backendRoot, '.public-url'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const url = fs.readFileSync(file, 'utf8').trim();
        if (url.startsWith('http')) return url.replace(/\/$/, '');
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function getLanIp() {
  const nets = os.networkInterfaces();
  const preferred = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      preferred.push(net.address);
    }
  }

  return preferred.find((ip) => ip.startsWith('192.168.'))
    || preferred.find((ip) => ip.startsWith('10.'))
    || preferred.find((ip) => ip.startsWith('172.'))
    || preferred[0]
    || null;
}

/** URL for email links and mobile access — never localhost when a public/LAN URL exists. */
function getAppUrl() {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, '');
  }

  const fromFile = readPublicUrlFile();
  if (fromFile) return fromFile;

  const frontend = process.env.FRONTEND_URL || '';
  if (frontend && !/localhost|127\.0\.0\.1/.test(frontend)) {
    return frontend.replace(/\/$/, '');
  }

  const ip = getLanIp();
  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 3001;

  if (ip) {
    return isProduction ? `http://${ip}:${port}` : `http://${ip}:5173`;
  }

  return frontend.replace(/\/$/, '') || `http://localhost:${isProduction ? port : 5173}`;
}

function readTunnelStatusFile() {
  const file = path.join(backendRoot, '.tunnel-status.json');
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getAccessInfo() {
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') || readPublicUrlFile();
  const ip = getLanIp();
  const port = process.env.PORT || 3001;
  const isPublicMode = Boolean(publicUrl) || process.env.NODE_ENV === 'production';
  const lanUrl = ip ? (isPublicMode ? `http://${ip}:${port}` : `http://${ip}:5173`) : null;
  const tunnelStatus = readTunnelStatusFile();

  return {
    publicUrl: publicUrl || null,
    lanUrl,
    recommendedUrl: publicUrl || lanUrl || getAppUrl(),
    mobileHint: publicUrl
      ? 'Open the public URL on your phone (works on WiFi and mobile data).'
      : lanUrl
        ? 'On your phone (same WiFi), open the LAN URL below. Do NOT use localhost.'
        : 'Run npm run start:public:bg from the project folder, then open the URL in .public-url',
    tunnel: {
      type: 'cloudflare-quick',
      ok: tunnelStatus?.tunnelOk ?? null,
      mode: tunnelStatus?.tunnelMode || 'cloudflare',
      updatedAt: tunnelStatus?.updatedAt || null,
      error1033Hint:
        'Error 1033 means an OLD trycloudflare.com link was used. Quick tunnel URLs change when the PC restarts — run show-mobile-url.bat for the current link. No custom DNS records exist for these URLs.',
      doNotUseOldBookmarks: true,
    },
  };
}

function savePublicUrl(url) {
  const normalized = url.replace(/\/$/, '');
  for (const file of [
    path.join(projectRoot, '.public-url'),
    path.join(backendRoot, '.public-url'),
  ]) {
    fs.writeFileSync(file, `${normalized}\n`, 'utf8');
  }
  process.env.PUBLIC_URL = normalized;
  return normalized;
}

function clearPublicUrl() {
  for (const file of [
    path.join(projectRoot, '.public-url'),
    path.join(backendRoot, '.public-url'),
  ]) {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
  delete process.env.PUBLIC_URL;
}

module.exports = {
  getAppUrl, getAccessInfo, getLanIp, readPublicUrlFile, savePublicUrl, clearPublicUrl, readTunnelStatusFile,
};
