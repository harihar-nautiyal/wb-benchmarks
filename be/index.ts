import { Elysia } from "elysia";
import { websocket } from "@elysiajs/websocket";
import { connect, performOps } from "../db_bench.cjs";

await connect();

new Elysia()
  .use(websocket())
  .ws("/", {
    async message(ws, message) {
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (e) {
        await performOps();
        ws.send(JSON.stringify({ status: "ok" }));
        return;
      }
      
      if (data && data._test) {
        ws.send(JSON.stringify({ 
          original: data.payload, 
          echo: data.payload 
        }));
      } else {
        await performOps();
        ws.send(JSON.stringify({ status: "ok" }));
      }
    },
  })
  .listen(3000);

console.log("BE Ready");
