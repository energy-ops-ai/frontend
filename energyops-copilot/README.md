# EnergyOps Copilot

Topology-aware AI copilot for operators of complex energy systems. See
[`../EnergyOps-Copilot-PLAN.md`](../EnergyOps-Copilot-PLAN.md) for the full plan.

## Layout

- `server/` — Hono + Claude Agent SDK. Streams the agent loop over SSE, hosts the
  in-process tools (data / widgets / memory), runs on **http://localhost:3460**.
- `web/` — Vite + React + Tailwind + shadcn-style UI. Chat panel + workspace canvas,
  runs on **http://localhost:5173** and proxies API calls to the server.

## Setup

1. Generate a subscription token (one-time, interactive):
   ```
   claude setup-token
   ```
2. Create `server/.env` from the example and paste the token:
   ```
   cp server/.env.example server/.env
   # set CLAUDE_CODE_OAUTH_TOKEN=...
   ```
3. Install deps (already done if you cloned with node_modules):
   ```
   cd server && npm install
   cd ../web && npm install
   ```

## Run (two terminals)

```
cd server && npm run dev     # http://localhost:3460
cd web && npm run dev        # http://localhost:5173  → open this
```

Open http://localhost:5173 and try: *"Run a connection test."*

## Status

- **P0 ✅** — scaffold + streaming chat + tool cards + widget pipeline verified end-to-end.
- **P1 ✅** — DuckDB data tools (`describe_dataset`, `query_data`, `get_topology`, `get_neighbors`),
  annotations store, and the Topology (React Flow) + Chart (Recharts) renderers. The agent discovers
  and explains the system from a vague prompt, dataset-agnostic.
- Next: **P2** — `scan_anomalies` / `scan_data_quality` + insight cards (the hero demo).

## Dev note

For iterative work use `npm run dev` (tsx watch) in `server/`. On Windows the watch-reload can
occasionally race the port (EADDRINUSE) because the SSE/SDK subprocess holds 3460 briefly; if that
happens, stop and use `npm start` (no watch), or kill stray `node` procs under `server/` first.
