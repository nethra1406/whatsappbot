const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔐 Replace with actual credentials or use environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ✅ Verified sender number (with country code)
const VERIFIED_NUMBER = '919043331484';

app.use(bodyParser.json());

// ✅ Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        console.log('✅ WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
    } else {
        console.log('❌ WEBHOOK_VERIFICATION_FAILED');
        res.sendStatus(403);
    }
});

// 📥 Handle incoming messages
app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];
        const sender = message?.from;
        const text = message?.text?.body;

        if (sender && text) {
            console.log(`📨 Message from ${sender}: ${text}`);

            // ✅ Only respond to the verified number
            if (sender !== VERIFIED_NUMBER) {
                console.log(`⛔ Ignored message from unverified number: ${sender}`);
                return res.sendStatus(200);
            }

            const userText = text.trim().toLowerCase();
            let reply;

            // 👋 Respond with catalogue on greetings
            if (['hi', 'hello', 'hey'].includes(userText)) {
                reply = `👋 Welcome to Mochitochi Laundry Services!

🧺 Here’s our service menu:

👕 *Shirts* – ₹15 per piece  
Professional washing & ironing

👖 *Pants* – ₹20 per piece  
Deep cleaning & perfect pressing

👗 *Sarees* – ₹100 per piece  
Gentle dry cleaning & folding

🧥 *Suits* – ₹250 per set  
Premium dry cleaning for formals

🛏️ *Bed Sheets* – ₹60 per piece  
Fresh wash & optional ironing

🪟 *Curtains* – ₹120 per set  
Deep cleaning with care

🧣 *Winter Wear* – ₹150 per piece  
Special care for jackets/sweaters

🧼 *Stain Removal* – ₹50 per stain  
Expert treatment for tough stains

🌐 View online: https://mochitochi.in

Let me know if you want to book or get help. 😊`;
            } 
            // 🧠 Keyword-based logic
            else if (userText.includes('help')) {
                reply = '🆘 I can help you book a service, get a price, or connect you to an agent.';
            } else if (userText.includes('price')) {
                reply = '💰 Our price list starts at ₹15. Type "hi" to view full menu.';
            } else if (userText.includes('order')) {
                reply = '🛒 You can book a service online at mochitochi.in or reply with "agent".';
            } else if (userText.includes('agent')) {
                reply = '👨‍💼 Connecting you with a human agent now...';
            } 
            // 🤖 Fallback response
            else {
                reply = `🤖 Dell-bot here! You said: "${text}". Type "hi" to see our menu or "help" for more options.`;
            }

            // 🚀 Send WhatsApp message
            await axios.post(
                `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: sender,
                    text: { body: reply }
                },
                {
                    headers: {
                        Authorization: `Bearer ${ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } else {
            console.log('📦 Webhook event received (not a message)');
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Error handling message:', error.message);
        res.sendStatus(500);
    }
});

// 🟢 Start server
app.listen(PORT, () => {
    console.log(`✅ Webhook server is running at http://localhost:${PORT}`);
});
