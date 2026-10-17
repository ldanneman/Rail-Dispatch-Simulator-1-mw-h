# Pages, Components, Functions, Testing

## Pages (tabs in src/App.jsx)
Dashboard (KPIs, alerts/bottlenecks, throughput, utilisation), Network (SVG + route highlight), Shipments (search/sort/filter + detail), Timeline (leg Gantt table), Test Lab (presets incl. reference A–B–C, editors, disruptions, import/export, baseline snapshot, reset), Capacity (hourly slot inspector with explicit never-exceeded check), Compare (baseline vs scenario + affected/rerouted list), Docs.

## Components
`App`, `ShipmentDetail`, `CapacityGrid`, `DisruptionEditor`, `TestLab` — all in src/App.jsx.

## Important functions
- `generateDataset(seed)` (generator.js) — deterministic 8 terminals / 16 connections / 100 shipments.
- `runScheduler(dataset)` / `scheduleShipment` / `effectiveConnections` / `effectiveShipments` (scheduler.js).
- `computeMetrics`, `diffRuns`, `describeDisruption` (metrics.js); `validateDataset`, `exportJSON`, `importJSON` (schema.js); `saveState/loadState/clearState` (storage.js); `getPresets`, `referenceScenario` (presets.js).

## Testing
Vitest (`tests/scheduler.test.js`, 11 tests): reference arrivals exactly 10/11/12; release-time, capacity, closure, multi-leg arrival-math invariants; disconnected → undeliverable with reason; tight deadlines → late not undeliverable; determinism (identical input → identical output); baseline isolation; localStorage round-trip (reload); import validation; metrics consistency.

## Known limitations
Greedy scheduler is not globally optimal; scheduling is instantaneous (no playback animation, explicitly optional in spec); terminal handling capacity is not modelled (throughput counts shown instead); Yarn Berry registry access was blocked in the authoring sandbox (deps installed/verified via npm into the same node_modules layout — `yarn install` works on a normal network).
