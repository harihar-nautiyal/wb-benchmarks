const { Server } = require("socket.io");
const { connect, performOps } = require("../db_bench.cjs");

const io = new Server(3000);

connect().then(() => {
  console.log("SN Ready");
  io.on("connection", (socket) => {
    socket.on("message", async (data) => {
      await performOps();
      socket.emit("response", { status: "ok" });
    });
  });
});
