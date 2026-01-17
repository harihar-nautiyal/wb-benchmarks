import { Server } from "socket.io";
import { connect, performOps } from "../db_bench.cjs";

const io = new Server({ cors: { origin: "*" } });

await connect();
console.log("SB Ready");

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

io.listen(3000);
