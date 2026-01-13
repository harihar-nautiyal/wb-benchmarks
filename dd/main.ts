import dbBench from "../db_bench.cjs";

const { connect, performOps } = dbBench;

await connect();

Deno.serve({ port: 3000 }, (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onmessage = async () => {
    await performOps();
    socket.send(JSON.stringify({ status: "ok" }));
  };
  return response;
});
console.log("DD Ready");
