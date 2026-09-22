# ♟️ Chamber Chess

*A quiet game of chess.*

Chamber Chess is a full chess implementation built from scratch in React — no chess engine library, no backend, just a hand-written rules engine, a clean brass-and-cream board, and (now) a way to play someone in real time from wherever they are. It's the kind of project that looks simple until you realize every legal move, every checkmate, every en passant capture is being worked out by hand in plain JavaScript.

**[Play it live →](#)** *https://chamber-chess.vercel.app/*

---

## ✨ Features

**A real chess engine, not a chessboard skin**
- Full legal move generation for every piece, including the rules people usually forget to implement: castling (both sides, with rights correctly revoked), en passant, and pawn promotion with a piece picker
- Check, checkmate, and stalemate detection, with the king's square highlighted when it's in danger
- A running material advantage readout, so you always know who's ahead and by how much
- Full move history in algebraic-style notation, with the ability to step back through any past position

**Three ways to play**
- **Local Two Player** — pass-and-play on one board, perfect for two people on the same screen
- **vs Computer** — a minimax engine with alpha-beta pruning across Easy, Medium, and Hard difficulty, playing either color
- **Play Online** — create a room, share the link, and play a live 1v1 with anyone, anywhere (see below)

**Built to actually feel good to play**
- Configurable time controls — Bullet, Blitz, Rapid, Classical, or Fischer increment — with live countdown clocks
- Undo, rematch, and a resign/menu flow with confirmation, so you never lose a game by a stray click
- Move and capture sound effects, check/checkmate cues, a fullscreen mode, and a responsive board that holds up on mobile
- A distinct, considered visual identity — brass tones, serif headings, a "quiet game" mood — instead of the default chess-app look

---

## ♟️ Play Online

Pick **Play Online** from the menu and either:
- **Create a Room** to get a shareable link — send it to whoever you want to play, and the match begins the moment they open it, or
- **Paste an invite link or room code** someone sent you to join theirs

Behind the scenes this uses a small, deliberately simple [socket.io](https://socket.io) relay server (`/server`). It doesn't referee the game — it just introduces two players and passes their moves back and forth. All the actual chess logic (legality, check, checkmate) is the same engine already running the rest of the app, validated independently on both sides. That keeps the server tiny, fast, and easy to run anywhere.

---

## 🛠️ Tech Stack

| | |
|---|---|
| **Frontend** | React 19, Vite |
| **Chess engine** | Hand-written — no chess.js or similar, every rule implemented directly |
| **Online play** | socket.io (client + a small Express relay server) |
| **Styling** | Hand-crafted CSS, no framework |
| **Deployment** | Vercel (frontend) + any Node host (multiplayer server) |

---

## 🚀 Getting Started

```bash
git clone https://github.com/suraj-86/chamber-chess.git
cd chamber-chess
npm install
npm run dev
```

Open the printed local URL and start playing. For the online multiplayer feature, see [Play Online](#-play-online) above.

---

## 📁 Project Structure

```
chamber-chess/
├── src/
│   ├── App.jsx        # the whole game: engine, UI, state — one focused file
│   ├── main.jsx
│   └── index.css
├── server/             # socket.io relay server for online 1v1
│   ├── index.js
│   └── package.json
├── public/
└── vercel.json
```

---

Built and maintained by [@suraj-86](https://github.com/suraj-86) — a small, self-contained project that quietly does a hard thing (chess rules) properly, rather than a big project that does an easy thing loudly.
