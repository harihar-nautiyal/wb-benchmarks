const { Server } = require("socket.io");
const { connect, performOps } = require("../db_bench.cjs");

const io = new Server(3000);

connect().then(() => {
  console.log("SN Ready");
  io.on("connection", async (socket) => {
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
});
