require('dotenv').config();

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());

const sessions = {}; // In-memory session store

// ✅ Add verified numbers here (in E.164 format - WhatsApp format, i.e., without '+' sign)
const verifiedNumbers = [
  '919916814517',
  '919043331484',
  '919710686191',
  '917358791933',
  '918072462490'
];

// ✅ Webhook verification (Meta callback)
app.get('/webhook', (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// ✅ Incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(404);

    const from = message.from;
    const msgBody = message.text?.body?.trim();

    // 🚫 Block unverified numbers
    if (!verifiedNumbers.includes(from)) {
      await sendText(from, '⚠️ Sorry, this service is currently only available to verified users.');
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
            await sendText(from, `✅ Added to cart: ${item.name} x ${item.qty}`);
            await sendText(from, `🛒 Type another item or "done" to finish.`);
          } else {
            await sendText(from, '⚠️ Invalid format. Use "Item x Quantity", e.g. "Shirt x 2"');
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
        await sendText(from, '💳 Choose payment method: Cash / UPI / Card');
        break;

      case 'get_payment':
        session.userInfo.payment = msgBody;
        session.step = 'confirm_order';
        await sendOrderSummary(from, session);
        break;

      case 'confirm_order':
        if (msgBody.toLowerCase() === 'place order') {
          await sendText(from, '🎉 Your order has been placed! Thank you!');
          console.log('🧾 Final Order:', session);
          delete sessions[from];
        } else {
          await sendText(from, '❓ Please type "Place Order" to confirm.');
        }
        break;

      default:
        await sendText(from, 'Hi! Type anything to see our laundry menu!');
        session.step = 'catalog';
        break;
    }

    sessions[from] = session;
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Error handling message:', error.response?.data || error.message);
    res.sendStatus(400);
  }
});

// ✅ Server listener
app.listen(port, () => {
  console.log(`✅ Webhook server is running at http://localhost:${port}`);
});

// ==========================
// 🔧 Helper functions below
// ==========================

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
  const responseMsg = 
`Welcome to Mochitochi Laundry Services! 🧺

Here’s our service menu:

👕 Shirts – ₹15/piece  
👖 Pants – ₹20/piece  
👗 Sarees – ₹100/piece  
🧥 Suits – ₹250/set

🛒 To order, reply with item and quantity like:
"Shirt x 2"
"Suit x 1"
Type "done" when you're finished.`;

  await sendText(to, responseMsg);
}

function parseItem(input) {
  const match = input.match(/(.+?)\s*x\s*(\d+)/i);
  if (!match) return null;
  const name = match[1].trim();
  const qty = parseInt(match[2], 10);
  const prices = {
    shirt: 15,
    pants: 20,
    saree: 100,
    suit: 250
  };
  const lowerName = name.toLowerCase();
  const priceKey = Object.keys(prices).find(k => lowerName.includes(k));
  const price = prices[priceKey];
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

