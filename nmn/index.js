const { WebSocketServer } = require("ws");
const { Packr } = require("msgpackr");
const { connect, performOps } = require("../db_bench.cjs");

const packer = new Packr();
const wss = new WebSocketServer({ port: 3000 });

connect().then(() => {
  console.log("NMN Ready");
  wss.on("connection", (ws) => {
    ws.on("message", async (data) => {
      const msg = packer.unpack(data);
      await performOps();
      ws.send(packer.pack({ status: "ok" }));
    });
  });
});
