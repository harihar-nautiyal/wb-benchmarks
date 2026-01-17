const { WebSocketServer } = require("ws");
const { Packr } = require("msgpackr");
const { connect, performOps } = require("../db_bench.cjs");

const packer = new Packr();
const wss = new WebSocketServer({ port: 3000 });

connect().then(() => {
  console.log("NMN Ready");
  wss.on("connection", async (ws) => {
    ws.on("message", async (data) => {
      const decoded = packer.unpack(data);
      
      if (decoded && decoded._test) {
        ws.send(packer.pack({ 
          original: decoded.payload, 
          echo: decoded.payload 
        }));
      } else if (decoded && decoded.original) {
        ws.send(packer.pack({ 
          original: decoded.original, 
          echo: decoded.original 
        }));
      } else {
        await performOps();
        ws.send(packer.pack({ status: "ok" }));
      }
    });
  });
});
