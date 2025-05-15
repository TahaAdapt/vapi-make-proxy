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

// In-memory store for pending Make responses
const pendingResponses = {};

// Endpoint that Vapi calls
app.post('/vapi-proxy', async (req, res) => {
  const requestId = Date.now().toString(); // Unique request ID
  req.body.requestId = requestId;

  try {
    // Send data to Make (including requestId)
    await axios.post(MAKE_WEBHOOK_URL, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Wait for Make to respond to /vapi-callback with the same requestId
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete pendingResponses[requestId];
        reject(new Error('Timeout waiting for Make response'));
      }, 15000); // Wait max 15s

      pendingResponses[requestId] = (data) => {
        clearTimeout(timeout);
        resolve(data);
      };
    });

    res.status(200).json(result); // Send Make's response back to Vapi
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

// Endpoint Make calls back to when it's done
app.post('/vapi-callback', (req, res) => {
  const { requestId, ...responseData } = req.body;

  // Optional cleanup: remove traceId from slotsAvailable if it exists
  if (
    responseData.slotsAvailable &&
    typeof responseData.slotsAvailable === 'object' &&
    'traceId' in responseData.slotsAvailable
  ) {
    delete responseData.slotsAvailable.traceId;
  }

  if (pendingResponses[requestId]) {
    pendingResponses[requestId](responseData);
    delete pendingResponses[requestId];
    res.status(200).json({ status: 'Delivered to proxy' });
  } else {
    res.status(404).json({ error: 'Unknown or expired requestId' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on port ${PORT}`);
});
