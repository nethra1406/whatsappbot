// db.js
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

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    const db = client.db("whatsappBot"); // choose your DB name
    const collection = db.collection("orders"); // your collection name
    cachedCollection = collection;
    return collection;
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    throw err;
  }
}

// ✅ This is what index.js uses
async function saveOrder(orderData) {
  try {
    const collection = await connectDB();
    const result = await collection.insertOne(orderData);
    console.log("📦 Order inserted with ID:", result.insertedId);
  } catch (err) {
    console.error("❌ Failed to save order:", err);
    throw err;
  }
}

module.exports = {
  saveOrder,
  connectDB // ✅ Optional, in case you use it later
};
