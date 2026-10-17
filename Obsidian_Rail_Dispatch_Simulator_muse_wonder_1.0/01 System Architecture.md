# System Architecture

> Vault note: intended for Obsidian vault `code_projects/Rail_Dispatch_Simulator_muse_wonder_1.0`. The authoring sandbox could not write outside the workspace, so this folder mirrors that exact name/structure in the repo — copy it into the vault (command in the handoff).

React + Vite + JavaScript (no TypeScript), Yarn, no backend, no API keys. State persists in `localStorage` (`rail-dispatch-simulator-v1`).

## Component tree
```
App (src/App.jsx)
├─ KPI header (derived from computeMetrics)
├─ Dashboard: alerts, Terminal Throughput, Connection Utilisation
├─ Network: SVG map + ShipmentDetail
├─ Shipments: searchable/sortable/filterable table + ShipmentDetail
├─ Timeline: all legs sorted by departure
├─ Test Lab: presets, DisruptionEditor, Terminal/Connection/Shipment editors, Import/Export
├─ Capacity: CapacityGrid (per-connection hourly slots)
├─ Compare: baseline vs scenario metrics + affected shipments + DisruptionEditor
└─ Docs
```

## Data flow
`generator/presets/import → dataset state → runScheduler(dataset) → computeMetrics + diffRuns → all views`. Every edit replaces `dataset` immutably (structuredClone), the scheduler recomputes via `useMemo`, and `{dataset, baselineData}` is saved to localStorage. The baseline is a separate state copy; scenario edits never write to it.
