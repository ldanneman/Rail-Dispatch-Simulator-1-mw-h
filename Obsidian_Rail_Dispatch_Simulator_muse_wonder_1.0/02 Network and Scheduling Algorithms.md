# Network and Scheduling Algorithms

**Capacity (simplified operational assumption):** max movements *entering* a connection per 1-hour departure slot, regardless of traversal duration. Bidirectional connections share one slot pool across both directions. Applied identically in scheduling, disruptions, capacity inspection, and tests.

**Rules:** integer hours, 168h (7-day) horizon, late = delivered after deadline, undeliverable only if no feasible schedule exists within the horizon, a closure blocks any movement whose [depart, depart+travel) overlaps [start, end).

**Algorithm (src/lib/scheduler.js):** greedy sequential priority scheduling. Shipments sort by priority (critical>high>normal>low), deadline, release, ID. Each is routed with a time-dependent Dijkstra whose edge function finds the earliest departure ≥ ready time with a free capacity slot and no closure overlap; booked slots reserve immediately. Tie-breaks: earliest arrival, fewer hops, lexicographically smallest path.

**Why:** the joint capacitated problem is NP-hard-like; this scheme is deterministic, feasible-by-construction (capacity/release/closure violations are impossible by construction and are also asserted in tests), prioritises urgent freight, and is auditable. It is **not** claimed globally optimal.
