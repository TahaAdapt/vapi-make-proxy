require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

if (!MAKE_WEBHOOK_URL) {
  console.error('❌ MAKE_WEBHOOK_URL is not set.');
  process.exit(1);
}

app.post('/vapi-proxy', async (req, res) => {
  try {
    const response = await axios.post(MAKE_WEBHOOK_URL, req.body, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json(response.data); // Return Make.com's response to Vapi
  } catch (error) {
    console.error('Error forwarding to Make:', error.message);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
