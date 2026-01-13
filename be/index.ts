import { Elysia } from "elysia";
import { websocket } from "@elysiajs/websocket";
import { connect, performOps } from "../db_bench.cjs";

await connect();

new Elysia()
  .use(websocket())
  .ws("/", {
    async message(ws, message) {
      await performOps();
      ws.send(JSON.stringify({ status: "ok" }));
    },
  })
  .listen(3000);

console.log("BE Ready");
