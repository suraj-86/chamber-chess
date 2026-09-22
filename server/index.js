/**
 * Chamber Chess — online 1v1 relay server.
 *
 * This is intentionally "dumb": it does not know chess rules. It just
 * pairs two sockets into a room and relays whatever move the client
 * already validated locally to the other player. That keeps it small
 * and easy to run anywhere Node runs.
 *
 * Run locally:   npm install && npm start   (defaults to port 3001)
 * Deploy:        works as-is on Render / Railway / Fly.io / any Node host.
 *                Set CLIENT_ORIGIN to your deployed frontend's URL in prod.
 */

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
// Comma-separated list of allowed origins, or "*" for any (fine for a hobby project).
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

// roomId -> { players: { w: socketId|null, b: socketId|null }, clockPreset }
const rooms = new Map();

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function makeRoomId() {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return id;
}

io.on("connection", (socket) => {
  socket.on("create-room", (payload, cb) => {
    const clockPreset = payload?.clockPreset || "none";
    let roomId = makeRoomId();
    while (rooms.has(roomId)) roomId = makeRoomId();

    rooms.set(roomId, { players: { w: socket.id, b: null }, clockPreset });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = "w";

    cb?.({ roomId });
  });

  socket.on("join-room", (payload, cb) => {
    const roomId = (payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found. Check the code and try again." });
    if (room.players.b) return cb?.({ error: "That room already has two players." });

    room.players.b = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = "b";
    cb?.({ ok: true });

    // Both sides learn their color/settings from this event — it's the
    // single signal the client uses to actually start the match.
    io.to(room.players.w).emit("room-start", { color: "w", clockPreset: room.clockPreset });
    io.to(room.players.b).emit("room-start", { color: "b", clockPreset: room.clockPreset });
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
    if (!room.players.w && !room.players.b) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Chamber Chess multiplayer server listening on :${PORT}`);
});
