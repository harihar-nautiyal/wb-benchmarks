import { Server } from "npm:socket.io";
import { createServer } from "node:http";
import dbBench from "../db_bench.cjs";

const { connect, performOps } = dbBench;

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

await connect();
console.log("SD Ready");

io.on("connection", (socket) => {
  socket.on("message", async (data) => {
    let payload = data;
    let isTest = false;
    
    if (data && typeof data === 'object') {
      if (data._test) {
        isTest = true;
        payload = data.payload;
      }
    }
    
    if (isTest) {
      socket.emit("response", { 
        original: payload, 
        echo: payload 
      });
    } else {
      await performOps();
      socket.emit("response", { status: "ok" });
    }
  });
});

httpServer.listen(3000);
