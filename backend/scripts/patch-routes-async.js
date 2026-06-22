const fs = require('fs');
const path = require('path');

const files = ['commutes.js', 'requests.js', 'employees.js', 'notifications.js'];

for (const f of files) {
  const p = path.join(__dirname, '..', 'src', 'routes', f);
  let c = fs.readFileSync(p, 'utf8');

  if (!c.includes('asyncRoute')) {
    c = c.replace(
      "const router = require('express').Router();",
      "const { asyncHandler } = require('../utils/asyncRoute');\n\nconst router = require('express').Router();"
    );
  }

  c = c.replace(/\bdb\.(\w+)\(/g, 'await db.$1(');
  c = c.replace(/await await db\./g, 'await db.');

  c = c.replace(/\], \(req, res\) => \{/g, '], asyncHandler(async (req, res) => {');
  c = c.replace(/router\.(get|post|put|patch|delete)\('([^']+)', \(req, res\) => \{/g,
    "router.$1('$2', asyncHandler(async (req, res) => {");

  fs.writeFileSync(p, c);
  console.log('patched', f);
}
