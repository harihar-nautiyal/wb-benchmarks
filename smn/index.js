import { createServer } from "node:http";
import { Server } from "socket.io";
import customParser from "socket.io-msgpack-parser";
import { connect, performOps } from "../db_bench.cjs";

const httpServer = createServer();

const io = new Server(httpServer, {
  parser: customParser,
  transports: ["websocket"],
  cors: { origin: "*" },
});

await connect();

io.on("connection", (socket) => {
  socket.on("message", async (data) => {
    if (data && data._test) {
      socket.send({
        original: data.payload,
        echo: data.payload,
      });
    } else if (data && data.original) {
      socket.send({
        original: data.original,
        echo: data.original,
      });
    } else {
      await performOps();
      socket.send({ status: "ok" });
    }
  });
});

httpServer.listen(3000, () => {
  console.log("WMB Ready");
});
