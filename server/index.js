const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((s) => s.trim())
  : "*";

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.get("/", (_req, res) => res.send("Chamber Chess multiplayer server is running."));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
});

const rooms = new Map();

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoomId() {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return id;
}

function safeName(raw) {
  const trimmed = (raw || "").toString().trim().slice(0, 24);
  return trimmed || "Player";
}

io.on("connection", (socket) => {
  socket.on("create-room", (payload, cb) => {
    const clockPreset = payload?.clockPreset || "none";
    const name = safeName(payload?.name);
    let roomId = makeRoomId();
    while (rooms.has(roomId)) roomId = makeRoomId();

    rooms.set(roomId, { players: { w: socket.id, b: null }, names: { w: name, b: null }, clockPreset });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = "w";

    cb?.({ roomId });
  });

  socket.on("join-room", (payload, cb) => {
    const roomId = (payload?.roomId || "").trim().toUpperCase();
    const name = safeName(payload?.name);
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found. Check the code and try again." });
    if (room.players.b) return cb?.({ error: "That room already has two players." });

    room.players.b = socket.id;
    room.names.b = name;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = "b";
    cb?.({ ok: true });

    io.to(room.players.w).emit("room-start", { color: "w", clockPreset: room.clockPreset, opponentName: room.names.b });
    io.to(room.players.b).emit("room-start", { color: "b", clockPreset: room.clockPreset, opponentName: room.names.w });
  });

  socket.on("move", (payload) => {
    const { roomId, from, move, promo } = payload || {};
    const room = rooms.get(roomId);
    if (!room) return;
    const opponentId = socket.data.color === "w" ? room.players.b : room.players.w;
    if (opponentId) io.to(opponentId).emit("opponent-move", { from, move, promo });
  });

  socket.on("resign", (payload) => {
    const { roomId } = payload || {};
    const room = rooms.get(roomId);
    if (!room) return;
    const opponentId = socket.data.color === "w" ? room.players.b : room.players.w;
    if (opponentId) io.to(opponentId).emit("opponent-resigned");
  });

  socket.on("disconnect", () => {
    const { roomId, color } = socket.data;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const opponentId = color === "w" ? room.players.b : room.players.w;
    if (opponentId) io.to(opponentId).emit("opponent-left");

    room.players[color] = null;
    room.names[color] = null;
    if (!room.players.w && !room.players.b) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Chamber Chess multiplayer server listening on :${PORT}`);
});
