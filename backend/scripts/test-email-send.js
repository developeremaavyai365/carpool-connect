require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { verifyEmailConnection, isEmailConfigured, buildOtpEmail } = require('../src/utils/mailer');
const { deliverEmailNow } = require('../src/services/emailQueue');

(async () => {
  console.log('configured', isEmailConfigured());
  console.log('verify', await verifyEmailConnection());
  const testTo = process.argv[2] || 'test.recipient@gmail.com';
  const { subject, html } = buildOtpEmail('register', '123456');
  try {
    const r = await deliverEmailNow({
      toEmail: testTo,
      subject,
      html,
      emailType: 'otp_register',
      skipEligibility: true,
    });
    console.log('send result', r, 'to', testTo);
  } catch (e) {
    console.error('send failed', e.message);
  }
})();
