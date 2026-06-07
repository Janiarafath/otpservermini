const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '523782ASmyQHfuq6a25aeacP1';
const OTP_EXPIRY = 300; // 5 minutes

// In-memory OTP store (one user, fine for single-user app)
const otpStore = {};

app.post('/api/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Invalid phone' });

  const code = crypto.randomInt(100000, 999999).toString();
  otpStore[phone] = { code, expires: Date.now() + OTP_EXPIRY * 1000 };

  if (MSG91_AUTH_KEY) {
    const postData = JSON.stringify({ mobile: phone.replace(/\D/g, '') });

    const options = {
      hostname: 'api.msg91.com',
      path: '/api/v5/otp',
      method: 'POST',
      headers: {
        'authkey': MSG91_AUTH_KEY,
        'Content-Type': 'application/json',
      },
    };

    const reqMsg = https.request(options, (resMsg) => {
      let data = '';
      resMsg.on('data', (chunk) => data += chunk);
      resMsg.on('end', () => {
        console.log('MSG91 response:', data);
        res.json({ success: true, message: 'OTP sent' });
      });
    });
    reqMsg.on('error', (e) => {
      console.error('MSG91 error:', e);
      res.status(500).json({ error: 'Failed to send OTP via SMS' });
    });
    reqMsg.write(postData);
    reqMsg.end();
  } else {
    console.log(`[DEV] OTP for ${phone}: ${code}`);
    res.json({ success: true, message: 'OTP sent (dev mode)' });
  }
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
