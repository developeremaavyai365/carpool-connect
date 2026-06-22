/**
 * Resolve cloudflared binary — winget installs to Program Files on Windows.
 */
const fs = require('fs');
const path = require('path');

const WIN_PATHS = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
];

function resolveCloudflared() {
  if (process.platform === 'win32') {
    for (const candidate of WIN_PATHS) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  }
  return 'cloudflared';
}

module.exports = { resolveCloudflared };
