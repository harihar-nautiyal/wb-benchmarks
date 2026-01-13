import { Server } from "socket.io";
import { connect, performOps } from "../db_bench.cjs";

const io = new Server({ cors: { origin: "*" } });

await connect();
console.log("SB Ready");

io.on("connection", (socket) => {
  socket.on("message", async (data) => {
    await performOps();
    socket.emit("response", { status: "ok" });
  });
});

io.listen(3000);
