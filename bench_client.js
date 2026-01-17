const { WebSocket } = require("ws");
const io = require("socket.io-client");
const { Packr } = require("msgpackr");
const protobuf = require("protobufjs");
const { Encoder, Decoder } = require("./smn/msgpackr-parser-client.cjs");

const TARGET = process.argv[2];
const PORT = 3000;
const DURATION = 60000;

const packer = new Packr();
let successCount = 0;
let verifyCount = 0;
let isRunning = true;

const root = protobuf.Root.fromJSON({
  nested: {
    Packet: {
      fields: { payload: { type: "string", id: 1 } },
    },
  },
});
const ProtoPacket = root.lookupType("Packet");

function generateRandomData(depth = 0, maxDepth = 4) {
  const types = ['string', 'number', 'boolean', 'array', 'object'];
  const type = types[Math.floor(Math.random() * types.length)];

  if (depth >= maxDepth) {
    return Math.random() > 0.5 ? 'leaf' : 42;
  }

  switch (type) {
    case 'string':
      return Math.random().toString(36).substring(2, 10 + Math.floor(Math.random() * 20));
    case 'number':
      return Math.random() * 10000;
    case 'boolean':
      return Math.random() > 0.5;
    case 'array':
      const arrLen = Math.floor(Math.random() * 5) + 1;
      return Array.from({ length: arrLen }, () => generateRandomData(depth + 1, maxDepth));
    case 'object':
      const objLen = Math.floor(Math.random() * 5) + 1;
      const obj = {};
      for (let i = 0; i < objLen; i++) {
        obj[`key_${Math.random().toString(36).substring(2, 8)}`] = generateRandomData(depth + 1, maxDepth);
      }
      return obj;
    default:
      return null;
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(key => deepEqual(a[key], b[key]));
}

async function run() {
  console.log(`Starting Client for target: ${TARGET}`);

  const useSocketIO = ["sb", "sd", "sn", "smn"].includes(TARGET);
  const useMsgPack = ["nmn", "wmb"].includes(TARGET);
  const useProto = ["wpn"].includes(TARGET);
  const useSocketIOMsgPack = ["smn"].includes(TARGET);
  const isSerializeTest = process.argv[3] === '--serialize-test';

  if (useSocketIO) {
    runSocketIO(isSerializeTest);
  } else {
    runNativeWS(useMsgPack, useProto, isSerializeTest);
  }

  setTimeout(() => {
    isRunning = false;
    const result = { target: TARGET, ppm: successCount };
    if (isSerializeTest) {
      result.verified = verifyCount;
      if (successCount > 0) {
        result.verificationRate = ((verifyCount / successCount) * 100).toFixed(2) + '%';
      } else {
        result.verificationRate = '0.00%';
      }
    }
    console.log(JSON.stringify(result));
    process.exit(0);
  }, DURATION);
}

function runSocketIO(isSerializeTest) {
  const socket = io(`http://localhost:${PORT}`, {
    transports: ["websocket"],
    reconnection: false,
    parser: useSocketIOMsgPack ? { Encoder, Decoder } : undefined,
  });

  socket.on("connect", () => {
    sendNext();
  });

  socket.on("connect_error", (err) => {
    console.error("Socket.io connection error:", err.message);
    isRunning = false;
  });

  socket.on("response", (data) => {
    if (!isRunning) return;
    successCount++;
    
    if (isSerializeTest) {
      let original, echo;
      
      if (typeof data === 'object') {
        if (data.original !== undefined) {
          original = data.original;
          echo = data.echo;
        } else if (data.payload !== undefined) {
          original = data.payload;
          echo = data.echo || data.payload;
        }
      }
      
      if (original !== undefined && echo !== undefined) {
        if (deepEqual(original, echo)) {
          verifyCount++;
        }
      }
    }
    
    sendNext();
  });

  function sendNext() {
    if (!isRunning) return;
    if (isSerializeTest) {
      const original = generateRandomData();
      socket.emit("message", { payload: original, _test: true });
    } else {
      socket.emit("message", { payload: "benchmark" });
    }
  }
}

function runNativeWS(useMsgPack, useProto, isSerializeTest) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on("open", () => {
    sendNext();
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    isRunning = false;
  });

  ws.on("close", () => {
    if (isRunning) {
      console.log("WebSocket closed unexpectedly");
    }
  });

  ws.on("message", (data) => {
    if (!isRunning) return;
    successCount++;

    if (isSerializeTest && useMsgPack) {
      try {
        const decoded = packer.unpack(data);
        let original, echo;
        
        if (decoded.original !== undefined) {
          original = decoded.original;
          echo = decoded.echo;
        } else if (decoded.payload !== undefined) {
          const parsed = JSON.parse(decoded.payload);
          original = parsed.original || parsed.payload;
          echo = parsed.echo || parsed.payload;
        }
        
        if (original !== undefined && echo !== undefined) {
          if (deepEqual(original, echo)) {
            verifyCount++;
          }
        }
      } catch (e) {
      }
    } else if (isSerializeTest && useProto) {
      try {
        const decoded = ProtoPacket.decode(data);
        const obj = ProtoPacket.toObject(decoded);
        if (obj && obj.payload && obj.payload.includes('_TEST_DATA_')) {
          try {
            const parsed = JSON.parse(obj.payload);
            const original = parsed.original || parsed.payload;
            const echo = parsed.echo || parsed.payload;
            if (deepEqual(original, echo)) {
              verifyCount++;
            }
          } catch (e) {}
        }
      } catch (e) {}
    } else if (isSerializeTest) {
      try {
        const text = data.toString();
        const parsed = JSON.parse(text);
        
        let original, echo;
        if (parsed.original !== undefined) {
          original = parsed.original;
          echo = parsed.echo;
        } else if (parsed.payload !== undefined) {
          original = parsed.payload;
          echo = parsed.echo || parsed.payload;
        }
        
        if (original !== undefined && echo !== undefined) {
          if (deepEqual(original, echo)) {
            verifyCount++;
          }
        }
      } catch (e) {}
    }

    sendNext();
  });

  function sendNext() {
    if (!isRunning) return;

    if (isSerializeTest) {
      const original = generateRandomData();
      
      if (useMsgPack) {
        const msg = packer.pack({ original: original, echo: original, _test: true });
        ws.send(msg);
      } else if (useProto) {
        const payload = JSON.stringify({ original: original, echo: original, _test: true });
        const err = ProtoPacket.verify({ payload: payload });
        if (err) throw Error(err);
        const msg = ProtoPacket.encode({ payload: payload }).finish();
        ws.send(msg);
      } else {
        ws.send(JSON.stringify({ original: original, echo: original, _test: true }));
      }
    } else {
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
}

run();
