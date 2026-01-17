import dbBench from "../db_bench.cjs";

const { connect, performOps } = dbBench;

await connect();

Deno.serve({ port: 3000 }, (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onmessage = async (event) => {
    let data;
    try {
      const text = event.data instanceof Blob 
        ? new TextDecoder().decode(await event.data.arrayBuffer())
        : event.data.toString();
      data = JSON.parse(text);
    } catch (e) {
      await performOps();
      socket.send(JSON.stringify({ status: "ok" }));
      return;
    }
    
    if (data && data._test) {
      socket.send(JSON.stringify({ 
        original: data.payload, 
        echo: data.payload 
      }));
    } else {
      await performOps();
      socket.send(JSON.stringify({ status: "ok" }));
    }
  };
  return response;
});
console.log("DD Ready");
