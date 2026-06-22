async function sendOtpSms(phone, code) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (accountSid && authToken && from) {
    try {
      const twilio = require('twilio')(accountSid, authToken);
      await twilio.messages.create({
        body: `CarPool Connect: Your verification code is ${code}. Valid for 10 minutes.`,
        from,
        to: `+91${phone}`,
      });
      return { sent: true, devMode: false };
    } catch (err) {
      console.error('[Twilio SMS error]', err.message);
    }
  }

  console.log(`[OTP SMS → +91${phone}] Code: ${code} (Configure TWILIO_* env vars for live SMS)`);
  return { sent: false, devMode: true };
}

module.exports = { sendOtpSms };
