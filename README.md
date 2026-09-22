# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Online 1v1 (socket.io)

The app now has an "Play Online" mode: create a room to get a shareable link, send it to a friend, and play a live 1v1. It uses a small socket.io relay server in `/server` that just passes moves between the two players — no chess logic runs server-side, the same hand-written engine already in `src/App.jsx` validates everything locally on both ends.

### Run it locally

```bash
# terminal 1 — the relay server
cd server
npm install
npm start          # listens on http://localhost:3001

# terminal 2 — the app
npm install
npm run dev
```

By default the frontend talks to `http://localhost:3001`. To point it at a different server, set `VITE_SOCKET_URL` (e.g. in a `.env` file):

```
VITE_SOCKET_URL=https://your-deployed-server.example.com
```

### Deploying

- **Frontend** — deploys as-is on Vercel (unchanged, `vercel.json` already handles the SPA rewrite). Just set the `VITE_SOCKET_URL` environment variable in your Vercel project settings to your deployed server's URL.
- **Server** — `server/` is a plain Node/Express/socket.io app, so it doesn't run on Vercel's serverless functions (websockets need a persistent process). Deploy it to something like [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io) — free tiers work fine for this. Start command is `npm install && npm start`. Optionally set `CLIENT_ORIGIN` to your frontend's URL to lock down CORS (defaults to allowing any origin).
