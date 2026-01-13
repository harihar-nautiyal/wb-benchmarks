const { MongoClient } = require("mongodb");

const client = new MongoClient("mongodb://127.0.0.1:27017", {
  driverInfo: { name: "bench-driver", version: "1.0.0" },
  monitorCommands: false,
});

let collection;

async function connect() {
  await client.connect();
  const db = client.db("packet_bench");
  collection = db.collection("logs");
  // Clear previous run
  await collection.deleteMany({});
}

async function performOps() {
  // 1. Create
  const doc = { temp: Math.random(), ts: Date.now() };
  const res = await collection.insertOne(doc);
  const id = res.insertedId;

  // 2. Find
  await collection.findOne({ _id: id });

  // 3. Update
  await collection.updateOne({ _id: id }, { $set: { updated: true } });

  // 4. Delete
  await collection.deleteOne({ _id: id });

  return true;
}

module.exports = { connect, performOps };
