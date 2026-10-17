# Rail Network Dispatch & Optimization Simulator

React + Vite + JavaScript, Yarn, no backend. Deterministic seeded network (8 terminals, 16 connections, 100 shipments), greedy priority time-dependent-Dijkstra scheduler respecting hourly departure-slot capacity, closures, and release times; Test Lab, disruptions, baseline comparison, capacity inspector, JSON import/export, localStorage persistence.

```bash
yarn install
yarn dev      # http://localhost:5173
yarn test     # Vitest — 11 tests incl. reference A–B–C arrivals 10/11/12
yarn build
```

Capacity = max movements entering a connection per 1-hour departure slot (bidirectional links share the pool). Horizon 168h. Full docs in `Obsidian_Rail_Dispatch_Simulator_muse_wonder_1.0/` (copy into your Obsidian vault `code_projects`).
