import { Packr } from "msgpackr";
import { connect, performOps } from "../db_bench.cjs";

const packer = new Packr();
await connect();

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response("Upgrade failed");
  },
  websocket: {
    async message(ws, message) {
      // Bun returns raw buffer for binary
      const data = packer.unpack(message);
      await performOps();
      ws.send(packer.pack({ status: "ok" }));
    },
  },
});
console.log("WMB Ready");
