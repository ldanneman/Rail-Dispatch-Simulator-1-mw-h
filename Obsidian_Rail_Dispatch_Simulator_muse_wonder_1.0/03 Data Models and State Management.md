# Data Models and State Management

- `Terminal {id, name, city, x, y}` — x/y position the SVG map.
- `Connection {id, from, to, bidirectional, travelTime, capacity}` — undirected.
- `Shipment {id, origin, destination, releaseTime, deadline, priority, cargo, weightTons}`; priorities `critical|high|normal|low`.
- `Disruption {id, type: closure|travel_increase|capacity_reduction|release_delay, connectionId|shipmentId, start, end, value}`.
- Result `{shipmentId, status: on-time|late|undeliverable, legs:[{connectionId,from,to,depart,arrive,travelTime,waitBefore}], arrivalTime, delay, totalWait, route, reason}`.

State: React `useState` for `dataset`, immutable `baselineData`, selection/filters; `useMemo` for scheduler/metrics/diff; `useEffect` persists to localStorage. Reset restores the seeded dataset (seed 20261017, mulberry32 PRNG in src/lib/rng.js + generator.js).

**Metrics formulas:** on-time % = on-time ÷ delivered (undeliverable excluded); avg delay = mean max(0, arrival−deadline) over delivered; terminal throughput = raw departure/arrival counts (no terminal capacity modelled).

**JSON schema v1** (src/lib/schema.js): `{version:1, name, terminals, connections, shipments, disruptions}` — validated for unique IDs, known terminals, travelTime > 0, capacity ≥ 0, valid priorities, closure end > start; malformed files are rejected with listed errors.
