const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// Import your database functions from db.js
const { 
  saveOrder, 
  assignVendorToOrder, 
  saveVendor, 
  linkOrderToVendor 
} = require('./db.js');

const app = express();
app.use(bodyParser.json());

// --- ⚙ CONFIGURATION ---
// Replace these with your actual credentials from the Meta App Dashboard
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "YOUR_SECRET_VERIFY_TOKEN"; 
const WHATSAPP_TOKEN = "YOUR_TEMPORARY_OR_PERMANENT_ACCESS_TOKEN";
const PHONE_NUMBER_ID = "YOUR_PHONE_NUMBER_ID";

// A list of phone numbers for your vendors/staff.
// Use the international format without '+' or spaces (e.g., "919876543210")
const VENDOR_NUMBERS = ["91xxxxxxxxxx", "91yyyyyyyyyy"]; 

// --- STATE MANAGEMENT ---
// A simple object to track where each user is in a conversation.
let userState = {};

// --- WEBHOOK ENDPOINTS ---

// This endpoint is used by Meta to verify your webhook.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    if (mode === 'subscribe') {
      console.log('✅ Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(403);
  }
});

// This is the main endpoint that receives all incoming messages.
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Ensure the request is a valid WhatsApp message notification
  if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    return res.sendStatus(200); // Not a message, but acknowledge receipt
  }

  const messageData = body.entry[0].changes[0].value.messages[0];
  const from = messageData.from; // User's phone number
  const msg_body = messageData.text.body.trim();

  // Helper function to send a reply back to the user
  const sendReply = (text) => {
    axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: text },
      },
      { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } }
    ).catch(error => console.error("Error sending reply:", error.response?.data));
  };

  try {
    const isVendor = VENDOR_NUMBERS.includes(from);

    // --- VENDOR LOGIC ---
    if (isVendor) {
      const [command, orderId] = msg_body.split(" ");
      if (command.toLowerCase() === 'assign' && orderId) {
        await saveVendor(from);
        await assignVendorToOrder(orderId, from);
        await linkOrderToVendor(orderId, from);
        sendReply(`✅ Order *${orderId}* has been assigned to you.`);
      } else {
        sendReply("Hello Vendor! To assign an order, please send:\n`assign <OrderID>`");
      }
    } 
    // --- CUSTOMER LOGIC ---
    else {
      const currentState = userState[from]?.action;
      
      if (currentState === 'awaiting_address') {
        const orderId = `LNDRY${Date.now()}`;
        await saveOrder({
          orderId,
          customerPhone: from,
          address: msg_body,
          status: 'new',
          createdAt: new Date(),
        });
        sendReply(`Thank you! Your pickup is scheduled.\n\nYour Order ID is: *${orderId}*\n\nPlease use this ID to check the status of your order.`);
        delete userState[from]; // Reset state after completion
      } 
      else if (msg_body.toLowerCase().startsWith('status')) {
        const parts = msg_body.split(" ");
        if (parts.length > 1) {
          const orderId = parts[1];
          // You would add a function in db.js to find the order and return its status
          sendReply(`Checking status for Order *${orderId}*... (feature coming soon)`);
        } else {
          sendReply('To check your order status, please send:\n`status <OrderID>`');
        }
      }
      else {
        switch (msg_body.toLowerCase()) {
          case 'pickup':
            userState[from] = { action: 'awaiting_address' };
            sendReply('Of course! Please reply with your full address for the pickup.');
            break;
          case 'services':
            sendReply('Our Services:\n\n- Wash & Fold: ₹500 per 5kg\n- Dry Cleaning: Starts at ₹150 per item\n- Ironing: ₹20 per item');
            break;
          default:
            sendReply("👋 Welcome to LaundryBot! How can I help you today?\n\n- Type pickup to schedule a pickup.\n- Type services to see our price list.\n- Type status <OrderID> to check your order.");
            break;
        }
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
    sendReply("Sorry, an error occurred. Please try again.");
  }

  res.sendStatus(200);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is live and listening on port ${PORT}`);
});