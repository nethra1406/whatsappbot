require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const { saveOrder } = require('./db');

const app = express();
const port = process.env.PORT || 10000;
app.use(bodyParser.json());

const sessions = {};
const userOrderStatus = {};
const vendorAssignments = {};
const pendingOrders = {};

const verifiedNumbers = [
  '919916814517', // Customer
  '917358791933', // Customer
  '919043331484', // Vendor
  '919710486191'  // Vendor
];

const vendors = ['919916814517', '917358791933'];

// ✅ Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ✅ Incoming Messages
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(404);

    const from = message.from;
    const msgBody = message.text?.body?.trim();

    // ✅ Vendor accepting order
    const acceptMatch = msgBody.toLowerCase().match(/^accept\s+(ord-\d+)/);
    if (vendors.includes(from) && acceptMatch) {
      const orderId = acceptMatch[1];

      if (!pendingOrders[orderId]) {
        await sendText(from, '❌ Order does not exist or already accepted.');
        return res.sendStatus(200);
      }

      if (vendorAssignments[orderId]) {
        await sendText(from, '🚫 This order is already accepted by another vendor.');
        return res.sendStatus(200);
      }

      // ✅ Assign vendor
      const { customerPhone, session } = pendingOrders[orderId];
      vendorAssignments[orderId] = from;

      await sendText(from, `✅ You’ve accepted ${orderId}. Please proceed.`);
      await sendText(customerPhone, `📦 Your order ${orderId} is being handled by vendor 📱 ${from}.`);

      delete pendingOrders[orderId];
      return res.sendStatus(200);
    }

    // ✅ Restrict to verified
    if (!verifiedNumbers.includes(from)) {
      await sendText(from, '⚠️ This bot is only for verified users.');
      return res.sendStatus(200);
    }

    // ✅ Prevent re-orders
    if (userOrderStatus[from] === 'placed' && msgBody.toLowerCase() === 'place order') {
      await sendText(from, '✅ You already placed the order. Please wait.');
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
          if (!session.cart.length) {
            await sendText(from, '🛒 Your cart is empty! Add items first.');
            return res.sendStatus(200);
          }
          session.step = 'get_name';
          await sendText(from, '👤 Please enter your full name:');
        } else {
          const item = parseItem(msgBody);
          if (item) {
            session.cart.push(item);
            await sendText(from, `✅ Added: ${item.name} x ${item.qty}`);
            await sendText(from, '🛒 Add more or type "done" when ready.');
          } else {
            await sendText(from, '⚠️ Invalid. Use "Item x Quantity", e.g. "Shirt x 2"');
          }
        }
        break;

      case 'get_name':
        session.userInfo.name = msgBody;
        session.step = 'get_address';
        await sendText(from, '📍 Enter your delivery address:');
        break;

      case 'get_address':
        session.userInfo.address = msgBody;
        session.step = 'get_payment';
        await sendText(from, '💳 Payment method: Cash / UPI / Card');
        break;

      case 'get_payment':
        session.userInfo.payment = msgBody;
        session.step = 'confirm_order';
        await sendOrderSummary(from, session);
        break;

      case 'confirm_order':
        if (msgBody.toLowerCase() === 'place order') {
          const orderId = `ORD-${Date.now()}`;
          await saveOrder({ orderId, phone: from, ...session });
          userOrderStatus[from] = 'placed';

          setTimeout(() => delete userOrderStatus[from], 10 * 60 * 1000); // Auto-reset

          await sendText(from, `🎉 Order ${orderId} placed! A vendor will be assigned.`);

          // Notify vendors
          pendingOrders[orderId] = { session, customerPhone: from };
          for (const vendor of vendors) {
            await sendText(vendor,
              `📢 New Order ${orderId}\nCustomer: ${session.userInfo.name}\nItems: ${session.cart.length}\nReply "ACCEPT ${orderId}" to accept.`);
          }

          delete sessions[from];
        } else {
          await sendText(from, '❓ Type "Place Order" to confirm.');
        }
        break;

      default:
        await sendText(from, '🤖 Type anything to see the laundry menu.');
        session.step = 'catalog';
    }

    sessions[from] = session;
    res.sendStatus(200);

  } catch (err) {
    console.error('❌ Error:', err.message || err);
    res.sendStatus(500);
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});

// ==============================
// 📦 Helper Functions
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
`🧺 Mochitochi Laundry Menu:

👕 Shirt – ₹15  
👖 Pants – ₹20  
👗 Saree – ₹100  
🧥 Suit – ₹250

Reply like: "Shirt x 2"
Type "done" when finished.`;
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
