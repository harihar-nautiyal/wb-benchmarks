const { WebSocketServer } = require("ws");
const protobuf = require("protobufjs");
const { connect, performOps } = require("../db_bench.cjs");

const root = protobuf.Root.fromJSON({
  nested: { Packet: { fields: { payload: { type: "string", id: 1 } } } },
});
const ProtoPacket = root.lookupType("Packet");

const wss = new WebSocketServer({ port: 3000 });

connect().then(() => {
  console.log("WPN Ready");
  wss.on("connection", async (ws) => {
    ws.on("message", async (data) => {
      const decoded = ProtoPacket.decode(data);
      const content = ProtoPacket.toObject(decoded);
      
      if (content.payload && content.payload.includes('_TEST_DATA_')) {
        try {
          const parsed = JSON.parse(content.payload);
          const echoPayload = JSON.stringify({
            original: parsed.original || parsed.payload,
            echo: parsed.original || parsed.payload
          });
          const resp = ProtoPacket.encode({ payload: echoPayload }).finish();
          ws.send(resp);
        } catch (e) {
          const resp = ProtoPacket.encode({ payload: content.payload }).finish();
          ws.send(resp);
        }
      } else {
        await performOps();
        const resp = ProtoPacket.encode({ payload: "ok" }).finish();
        ws.send(resp);
      }
    });
  });
});
