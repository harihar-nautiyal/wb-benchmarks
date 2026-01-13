import { Hono } from "npm:hono";
import { upgradeWebSocket } from "npm:hono/deno";
import dbBench from "../db_bench.cjs";

// @ts-ignore
const { connect, performOps } = dbBench;

const app = new Hono();
await connect();

app.get(
  "/",
  upgradeWebSocket((c) => {
    return {
      onMessage: async (event, ws) => {
        await performOps();
        ws.send(JSON.stringify({ status: "ok" }));
      },
    };
  }),
);

// Explicitly bind to 0.0.0.0 for Deno
Deno.serve({ port: 3000, hostname: "0.0.0.0" }, app.fetch);
console.log("DH Ready");
