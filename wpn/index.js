const { WebSocketServer } = require("ws");
const protobuf = require("protobufjs");
const { connect, performOps } = require("../db_bench.cjs");

// Setup Proto
const root = protobuf.Root.fromJSON({
  nested: { Packet: { fields: { payload: { type: "string", id: 1 } } } },
});
const ProtoPacket = root.lookupType("Packet");

const wss = new WebSocketServer({ port: 3000 });

connect().then(() => {
  console.log("WPN Ready");
  wss.on("connection", (ws) => {
    ws.on("message", async (data) => {
      const decoded = ProtoPacket.decode(data);
      await performOps();
      const resp = ProtoPacket.encode({ payload: "ok" }).finish();
      ws.send(resp);
    });
  });
});
