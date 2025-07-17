import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

app.get('/', (req, res) => {
  res.send('✅ Webhook server is running!');
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Message handling
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (message && message.text) {
      const sender = message.from;
      const text = message.text.body?.toLowerCase() || '';

      const responseMessage = 
`Welcome to Mochitochi Laundry Services! 🧺

Here’s our service menu:

👕 Shirts – ₹15 per piece  
Professional washing & ironing

👖 Pants – ₹20 per piece  
Deep cleaning & perfect pressing

👗 Sarees – ₹100 per piece  
Gentle dry cleaning & folding

🧥 Suits – ₹250 per set  
Premium dry cleaning & finishing

🕙 Service hours: 9 AM – 8 PM
📍 Pickup & Delivery Available!
📞 Contact: +91 90433 31484`;

      await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: 'whatsapp',
        to: sender,
        text: { body: responseMessage },
      }, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📨 Message from ${sender}: ${text}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error handling message:', error.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Webhook server is running at http://localhost:${PORT}`);
});
