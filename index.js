require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
if (!MAKE_WEBHOOK_URL) {
  console.error('❌ MAKE_WEBHOOK_URL is not set.');
  process.exit(1);
}

const pendingResponses = {};

// Vapi sends the request here
app.post('/vapi-proxy', async (req, res) => {
  const requestId = Date.now().toString();
  req.body.requestId = requestId;

  try {
    await axios.post(MAKE_WEBHOOK_URL, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete pendingResponses[requestId];
        reject(new Error('Timeout waiting for Make response'));
      }, 15000); // 15s timeout

      pendingResponses[requestId] = (data) => {
        clearTimeout(timeout);
        resolve(data);
      };
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

// Make sends the response here
app.post('/vapi-callback', (req, res) => {
  const { requestId, ...responseData } = req.body;

  const originalSlots = responseData.slotsAvailable || {};
  const cleanedSlots = {};
  let dateIndex = 1;

  for (const key in originalSlots) {
    if (key === 'traceId') continue;

    cleanedSlots[`Date${dateIndex}`] = {
      date: key,
      slots: originalSlots[key].slots || []
    };
    dateIndex++;
  }

  responseData.slotsAvailable = cleanedSlots;

  if (pendingResponses[requestId]) {
    pendingResponses[requestId](responseData);
    delete pendingResponses[requestId];
    res.status(200).json({ status: 'Delivered to proxy (cleaned)' });
  } else {
    res.status(404).json({ error: 'Unknown or expired requestId' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on port ${PORT}`);
});
