import { Hono } from "npm:hono";
import { upgradeWebSocket } from "npm:hono/deno";
import dbBench from "../db_bench.cjs";

const { connect, performOps } = dbBench;

const app = new Hono();
await connect();

app.get(
  "/",
  upgradeWebSocket((c) => {
    return {
      onMessage: async (event, ws) => {
        let data;
        try {
          const text = event.data instanceof Blob 
            ? new TextDecoder().decode(await event.data.arrayBuffer())
            : event.data.toString();
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

Deno.serve({ port: 3000, hostname: "0.0.0.0" }, app.fetch);
console.log("DH Ready");
