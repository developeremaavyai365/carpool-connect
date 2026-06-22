const fs = require('fs');
const path = require('path');

const files = ['commutes.js', 'requests.js', 'employees.js', 'notifications.js'];

for (const f of files) {
  const p = path.join(__dirname, '..', 'src', 'routes', f);
  let c = fs.readFileSync(p, 'utf8');

  c = c.replace(
    /asyncHandler\(async \(req, res\) => \{([\s\S]*?)\n\}\);(\s*(?:\nrouter|\nmodule|\n$))/g,
    'asyncHandler(async (req, res) => {$1\n}));$2'
  );

  fs.writeFileSync(p, c);
  console.log('fixed closings', f);
}
