require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const { saveOrder } = require('./db'); // <-- MongoDB helper

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

const sessions = {}; // In-memory session store

const verifiedNumbers = [
  '919916814517',
  '919043331484',
  '919710686191',
  '917358791933',
  '918072462490'
];

// ✅ Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ✅ Incoming messages
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(404);

    const from = message.from;
    const msgBody = message.text?.body?.trim();

    if (!verifiedNumbers.includes(from)) {
      await sendText(from, '⚠️ Sorry, this service is only for verified users.');
      return res.sendStatus(200);
    }

    const session = sessions[from] || { step: 'catalog', cart: [], userInfo: {} };

    switch (session.step) {
      case 'catalog':
        await sendCatalog(from);
        session.step = 'ordering';
        break;

      case 'ordering':
        if (msgBody.toLowerCase() === 'done') {
          await sendText(from, '📝 Please provide your full name:');
          session.step = 'get_name';
        } else {
          const item = parseItem(msgBody);
          if (item) {
            session.cart.push(item);
            await sendText(from, `✅ Added: ${item.name} x ${item.qty}`);
            await sendText(from, `🛒 Add more or type "done" when finished.`);
          } else {
            await sendText(from, '⚠️ Invalid. Use "Item x Quantity", e.g. "Shirt x 2"');
          }
        }
        break;

      case 'get_name':
        session.userInfo.name = msgBody;
        session.step = 'get_address';
        await sendText(from, '📍 Please enter your address:');
        break;

      case 'get_address':
        session.userInfo.address = msgBody;
        session.step = 'get_payment';
        await sendText(from, '💳 Choose payment: Cash / UPI / Card');
        break;

      case 'get_payment':
        session.userInfo.payment = msgBody;
        session.step = 'confirm_order';
        await sendOrderSummary(from, session);
        break;

      case 'confirm_order':
        if (msgBody.toLowerCase() === 'place order') {
          await saveOrder({ phone: from, ...session }); // 🧠 Save to DB
          await sendText(from, '🎉 Order placed! Thank you!');
          console.log('🧾 Order saved:', session);
          delete sessions[from];
        } else {
          await sendText(from, '❓ Type "Place Order" to confirm.');
        }
        break;

      default:
        await sendText(from, 'Hi! Type anything to view our laundry menu.');
        session.step = 'catalog';
    }

    sessions[from] = session;
    res.sendStatus(200);

  } catch (err) {
    console.error('❌ Error:', err.message || err);
    res.sendStatus(500);
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});

// ==============================
// 🔧 Helper functions below
// ==============================

async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

async function sendCatalog(to) {
  const msg = 
`Welcome to Mochitochi Laundry Services! 🧺

Here’s our service Menu:
👕 Shirt – ₹15  
👖 Pants – ₹20  
👗 Saree – ₹100  
🧥 Suit – ₹250

Reply like:
"Shirt x 2"
"Suit x 1"
Type "done" when ready.`;

  await sendText(to, msg);
}

function parseItem(input) {
  const match = input.match(/(.+?)\s*x\s*(\d+)/i);
  if (!match) return null;
  const name = match[1].trim();
  const qty = parseInt(match[2]);
  const prices = {
    shirt: 15,
    pants: 20,
    saree: 100,
    suit: 250
  };
  const key = Object.keys(prices).find(k => name.toLowerCase().includes(k));
  const price = prices[key];
  return price ? { name, qty, price } : null;
}

async function sendOrderSummary(to, session) {
  const { cart, userInfo } = session;
  let total = 0;

  const items = cart.map(item => {
    const cost = item.qty * item.price;
    total += cost;
    return `• ${item.name} x ${item.qty} = ₹${cost}`;
  }).join('\n');

  const summary = 
`🧾 Order Summary:
${items}
————————————
👤 Name: ${userInfo.name}
🏠 Address: ${userInfo.address}
💳 Payment: ${userInfo.payment}
Total: ₹${total}

✅ Type "Place Order" to confirm.`;

  await sendText(to, summary);
}


