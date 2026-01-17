import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { connect, performOps } from "../db_bench.cjs";

const { upgradeWebSocket, websocket } = createBunWebSocket(Bun);
const app = new Hono();

await connect();

app.get(
  "/",
  upgradeWebSocket((c) => {
    return {
      onMessage: async (event, ws) => {
        let data;
        try {
          const text = event.data.toString();
          data = JSON.parse(text);
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
    };
  }),
);

Bun.serve({
  fetch: app.fetch,
  port: 3000,
  websocket,
});
console.log("BH Ready");
