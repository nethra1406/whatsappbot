const { MongoClient, ServerApiVersion } = require("mongodb");

// --- IMPORTANT ---
// Replace this with the connection string from your MongoDB Atlas dashboard
const uri = "mongodb+srv://admin:admiN@cluster0.nzat7fd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// A global variable to hold the database connection object
let dbConnection = null;

/**
 * Connects to the MongoDB database and caches the connection.
 * Returns the database object.
 */
async function connectToDatabase() {
  if (dbConnection) {
    return dbConnection;
  }
  try {
    await client.connect();
    dbConnection = client.db("whatsappBot");
    console.log("✅ Connected successfully to MongoDB");
    return dbConnection;
  } catch (error) {
    console.error("❌ Could not connect to MongoDB", error);
    // Exit the process with an error code if the database connection fails
    process.exit(1);
  }
}

/**
 * Saves a new order to the 'orders' collection.
 * @param {object} orderData - The order object to be saved.
 */
async function saveOrder(orderData) {
  const db = await connectToDatabase();
  const collection = db.collection("orders");
  await collection.insertOne(orderData);
  console.log(`📦 New order saved: ${orderData.orderId}`);
}

/**
 * Updates an order to assign a vendor and change its status.
 * @param {string} orderId - The ID of the order to update.
 * @param {string} vendorPhone - The phone number of the vendor being assigned.
 */
async function assignVendorToOrder(orderId, vendorPhone) {
  const db = await connectToDatabase();
  const collection = db.collection("orders");
  const result = await collection.updateOne(
    { orderId: orderId },
    {
      $set: {
        vendorId: vendorPhone,
        status: "assigned",
        assignedAt: new Date(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`✅ Vendor assigned to order ${orderId}`);
  } else {
    console.warn(`⚠ Order ID ${orderId} not found or already assigned.`);
  }
}

/**
 * Saves a new vendor to the 'vendors' collection if they don't already exist.
 * @param {string} vendorPhone - The phone number of the vendor.
 */
async function saveVendor(vendorPhone) {
  const db = await connectToDatabase();
  const collection = db.collection("vendors");

  // Check if vendor already exists to avoid duplicates
  const existingVendor = await collection.findOne({ phone: vendorPhone });
  if (!existingVendor) {
    await collection.insertOne({
      phone: vendorPhone,
      assignedOrders: [],
      createdAt: new Date(),
    });
    console.log(`✅ New vendor added: ${vendorPhone}`);
  }
}

/**
 * Adds an order ID to a vendor's list of assigned orders.
 * @param {string} orderId - The ID of the order.
 * @param {string} vendorPhone - The phone number of the vendor.
 */
async function linkOrderToVendor(orderId, vendorPhone) {
  const db = await connectToDatabase();
  const collection = db.collection("vendors");

  // Use $addToSet to prevent adding duplicate order IDs
  await collection.updateOne(
    { phone: vendorPhone },
    { $addToSet: { assignedOrders: orderId } }
  );
  console.log(`🔗 Linked order ${orderId} to vendor ${vendorPhone}`);
}

// Export all the functions so they can be used in your index.js file
module.exports = {
  connectToDatabase,
  saveOrder,
  assignVendorToOrder,
  saveVendor,
  linkOrderToVendor,
};