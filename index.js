const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

// Webhook verification
app.get('/webhook', (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Receive message
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];

      if (message) {
        const from = message.from;
        const msgBody = message.text?.body;

        console.log(`📨 Message from ${from}: ${msgBody}`);

        // Send a menu back
        const responseMsg = 
`Welcome to Mochitochi Laundry Services! 🧺

Here’s our service menu:

👕 Shirts – ₹15/piece  
Professional washing & ironing

👖 Pants – ₹20/piece  
Deep cleaning & perfect pressing

👗 Sarees – ₹100/piece  
Gentle dry cleaning & folding

🧥 Suits – ₹250/set  
Premium dry cleaning for formalwear`;

        await axios.post(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
          messaging_product: 'whatsapp',
          to: from,
          text: { body: responseMsg }
        }, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        res.sendStatus(200);
      } else {
        res.sendStatus(404);
      }
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Error handling message:', error.message);
    res.sendStatus(400);
  }
});

app.listen(port, () => {
  console.log(`✅ Webhook server is running at http://localhost:${port}`);
});
