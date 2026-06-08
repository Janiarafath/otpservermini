const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const PHONEEMAIL_API_KEY = process.env.PHONEEMAIL_API_KEY || 'bQ4PSEuP75HWxDnFe9xEQwAIz1jAmGv3';
const PHONEEMAIL_FROM_PHONE = process.env.PHONEEMAIL_FROM_PHONE || '8148647818';
const OTP_EXPIRY = 300; // 5 minutes

// In-memory OTP store
const otpStore = {};

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'OTP server running' });
});

app.post('/api/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Invalid phone' });

  const code = crypto.randomInt(100000, 999999).toString();
  otpStore[phone] = { code, expires: Date.now() + OTP_EXPIRY * 1000 };

  const toPhone = phone.replace(/\D/g, '');
  const message = `Your Veloride OTP is: ${code}. Valid for 5 minutes.`;
  const messageBase64 = Buffer.from(message).toString('base64');

  const postData = JSON.stringify({
    apiKey: PHONEEMAIL_API_KEY,
    fromCountryCode: '+91',
    fromPhoneNo: PHONEEMAIL_FROM_PHONE,
    toCountrycode: '+91',
    toPhoneNo: toPhone,
    subject: `OTP - ${code} from Veloride`,
    messageBody: messageBase64,
    tinyFlag: true,
  });

  const options = {
    hostname: 'api.phone.email',
    path: '/v1/sendmail',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const reqPh = https.request(options, (resPh) => {
    let data = '';
    resPh.on('data', (chunk) => data += chunk);
    resPh.on('end', () => {
      console.log('phone.email response:', data);
      res.json({ success: true, message: 'OTP sent' });
    });
  });
  reqPh.on('error', (e) => {
    console.error('phone.email error:', e);
    res.status(500).json({ error: 'Failed to send OTP via SMS' });
  });
  reqPh.write(postData);
  reqPh.end();
});

app.post('/api/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  const entry = otpStore[phone];
  if (!entry) return res.status(400).json({ error: 'No OTP sent to this number' });
  if (Date.now() > entry.expires) {
    delete otpStore[phone];
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (entry.code !== code) return res.status(400).json({ error: 'Invalid OTP' });

  delete otpStore[phone];
  res.json({ success: true, message: 'Phone verified' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`OTP server running on port ${PORT}`);
});
