const url = process.env.HEALTH_URL || 'http://localhost:3001/api/health';

async function main() {
  let res;
  try {
    res = await fetch(url);
  } catch {
    console.error('Backend is NOT running.');
    console.error('Start it first:  npm run dev');
    process.exit(1);
  }

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  const { email } = data;
  console.log('');
  if (email?.connected) {
    console.log('Gmail: READY (configured and connected)');
    process.exit(0);
  }
  if (email?.configured) {
    console.log('Gmail: CONFIGURED but NOT connected');
    console.log('Fix: Create a new App Password at https://myaccount.google.com/apppasswords');
    console.log('     Update GMAIL_APP_PASSWORD in backend/.env (no spaces), then restart backend.');
    if (email.detail) console.log('Detail:', email.detail.split('\n')[0]);
    process.exit(1);
  }
  console.log('Gmail: NOT configured');
  console.log('Fix: Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env');
  process.exit(1);
}

main();
