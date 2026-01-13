// bench_client.js
const { WebSocket } = require("ws");
const io = require("socket.io-client");
const { Packr } = require("msgpackr");
const protobuf = require("protobufjs");

const TARGET = process.argv[2]; // e.g., 'nmn', 'sn'
const PORT = 3000;
const DURATION = 60000; // 60 seconds

const packer = new Packr();
let successCount = 0;
let isRunning = true;

// Protobuf setup
const root = protobuf.Root.fromJSON({
  nested: {
    Packet: {
      fields: { payload: { type: "string", id: 1 } },
    },
  },
});
const ProtoPacket = root.lookupType("Packet");

async function run() {
  console.log(`Starting Client for target: ${TARGET}`);

  // Determine Protocol and Serialization
  const useSocketIO = ["sb", "sd", "sn"].includes(TARGET);
  const useMsgPack = ["nmn", "wmb"].includes(TARGET);
  const useProto = ["wpn"].includes(TARGET);

  if (useSocketIO) {
    runSocketIO();
  } else {
    runNativeWS(useMsgPack, useProto);
  }

  // Timer
  setTimeout(() => {
    isRunning = false;
    console.log(JSON.stringify({ target: TARGET, ppm: successCount }));
    process.exit(0);
  }, DURATION);
}

function runSocketIO() {
  const socket = io(`http://localhost:${PORT}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  socket.on("connect", () => {
    sendNext();
  });

  socket.on("response", () => {
    if (!isRunning) return;
    successCount++;
    sendNext();
  });

  function sendNext() {
    if (!isRunning) return;
    socket.emit("message", { payload: "benchmark" });
  }
}

function runNativeWS(useMsgPack, useProto) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on("open", () => {
    sendNext();
  });

  ws.on("message", (data) => {
    if (!isRunning) return;
    successCount++;
    sendNext();
  });

  function sendNext() {
    if (!isRunning) return;

    let msg = JSON.stringify({ payload: "benchmark" });

    if (useMsgPack) {
      msg = packer.pack({ payload: "benchmark" });
    } else if (useProto) {
      const err = ProtoPacket.verify({ payload: "benchmark" });
      if (err) throw Error(err);
      msg = ProtoPacket.encode({ payload: "benchmark" }).finish();
    }

    ws.send(msg);
  }
}

run();
