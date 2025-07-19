const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = "mongodb+srv://admin:admiN@cluster0.nzat7fd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let cachedCollection = null;

async function connectDB() {
  if (cachedCollection) return cachedCollection;
  await client.connect();
  console.log("✅ Connected to MongoDB");
  const db = client.db("whatsappBot");
  cachedCollection = db.collection("orders");
  return cachedCollection;
}

async function saveOrder(orderData) {
  const collection = await connectDB();
  await collection.insertOne(orderData);
  console.log("📦 Order saved");
}

async function assignVendorToOrder(orderId, vendorPhone) {
  const collection = await connectDB();
  const result = await collection.updateOne(
    { orderId },
    {
      $set: {
        vendorId: vendorPhone,
        status: "assigned",
        assignedAt: new Date()
      }
    }
  );
  if (result.modifiedCount) {
    console.log(`✅ Vendor assigned to ${orderId}`);
  } else {
    console.warn(`⚠️ Order ID ${orderId} not found`);
  }
}

// 🔥 NEW FUNCTIONS
async function saveVendor(vendorPhone) {
  const db = client.db("whatsappBot");
  const collection = db.collection("vendors");

  const exists = await collection.findOne({ phone: vendorPhone });
  if (!exists) {
    await collection.insertOne({ phone: vendorPhone, assignedOrders: [], createdAt: new Date() });
    console.log("✅ New vendor added:", vendorPhone);
  }
}

async function linkOrderToVendor(orderId, vendorPhone) {
  const db = client.db("whatsappBot");
  const collection = db.collection("vendors");
  await collection.updateOne(
    { phone: vendorPhone },
    { $addToSet: { assignedOrders: orderId } }
  );
  console.log(`📦 Linked order ${orderId} to vendor ${vendorPhone}`);
}

module.exports = {
  connectDB,
  saveOrder,
  assignVendorToOrder,
  saveVendor,
  linkOrderToVendor
};
