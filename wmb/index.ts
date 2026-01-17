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
      const data = packer.unpack(message);
      
      if (data && data._test) {
        ws.send(packer.pack({ 
          original: data.payload, 
          echo: data.payload 
        }));
      } else if (data && data.original) {
        ws.send(packer.pack({ 
          original: data.original, 
          echo: data.original 
        }));
      } else {
        await performOps();
        ws.send(packer.pack({ status: "ok" }));
      }
    },
  },
});
console.log("WMB Ready");
