const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

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

  const toPhone = phone.replace(/\D/g, '').slice(-10);
  const postData = JSON.stringify({
    apiKey: process.env.MERAOTP_API_KEY || '59076211e095cce1a422b7cdc8',
    mobileNo: toPhone,
    messageType: 'AUTH_OTP',
    brandName: 'Veloride',
    otp: code,
    senderId: 'MRAOTP',
  });

  const options = {
    hostname: 'meraotp.in',
    path: '/api/sendSMS',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  };

  const reqMera = https.request(options, (resMera) => {
    let data = '';
    resMera.on('data', (chunk) => data += chunk);
    resMera.on('end', () => {
      console.log('MeraOTP response:', data);
      try {
        const parsed = JSON.parse(data);
        if (parsed.success) {
          res.json({ success: true, message: 'OTP sent' });
        } else {
          res.status(502).json({ error: 'SMS failed', detail: parsed.message });
        }
      } catch {
        res.status(502).json({ error: 'SMS provider error', detail: data });
      }
    });
  });
  reqMera.on('timeout', () => {
    reqMera.destroy();
    console.error('MeraOTP timeout');
    res.status(504).json({ error: 'SMS provider timeout' });
  });
  reqMera.on('error', (e) => {
    console.error('MeraOTP error:', e.message);
    res.status(500).json({ error: 'Failed to send OTP via SMS', detail: e.message });
  });
  reqMera.write(postData);
  reqMera.end();
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
