import { mulberry32, int, pick } from './rng.js';

export const SEED = 20261017;
export const HORIZON = 168; // 7 days, integer hours

export const TERMINAL_DEFS = [
  { id: 'T1', name: 'Ironbridge Yard', city: 'Ironbridge', x: 90, y: 90 },
  { id: 'T2', name: 'Port Calder', city: 'Calder Bay', x: 300, y: 60 },
  { id: 'T3', name: 'Northgate Intermodal', city: 'Northgate', x: 520, y: 100 },
  { id: 'T4', name: 'Westfield Freight Hub', city: 'Westfield', x: 80, y: 250 },
  { id: 'T5', name: 'Central Exchange', city: 'Millbrook', x: 310, y: 220 },
  { id: 'T6', name: 'Eastmoor Terminal', city: 'Eastmoor', x: 540, y: 260 },
  { id: 'T7', name: 'Southport Docks', city: 'Southport', x: 180, y: 400 },
  { id: 'T8', name: 'Highland Logistics Park', city: 'Highland', x: 470, y: 410 },
];

// 16 connections (>=14), bidirectional, shared capacity both directions.
const EDGE_DEFS = [
  ['T1', 'T2'], ['T1', 'T4'], ['T1', 'T5'], ['T2', 'T3'], ['T2', 'T5'],
  ['T3', 'T6'], ['T3', 'T5'], ['T4', 'T5'], ['T4', 'T7'], ['T5', 'T6'],
  ['T5', 'T7'], ['T5', 'T8'], ['T6', 'T8'], ['T7', 'T8'], ['T2', 'T4'], ['T3', 'T8'],
];

const CARGO = ['Steel coils', 'Grain', 'Containers', 'Timber', 'Chemicals', 'Auto parts', 'Coal', 'Machinery', 'Food freight', 'Paper reels'];
export const PRIORITIES = ['critical', 'high', 'normal', 'low'];
export const PRIORITY_WEIGHT = { critical: 4, high: 3, normal: 2, low: 1 };

export function generateDataset(seed = SEED) {
  const rng = mulberry32(seed);
  const terminals = TERMINAL_DEFS.map((t) => ({ ...t }));
  const connections = EDGE_DEFS.map(([from, to], i) => ({
    id: `C${i + 1}`, from, to, bidirectional: true,
    travelTime: int(rng, 2, 7), capacity: int(rng, 2, 5),
  }));
  // Rough shortest travel for deadline slack (simple BFS by travel time ignoring capacity).
  const adj = new Map(terminals.map((t) => [t.id, []]));
  connections.forEach((c) => { adj.get(c.from).push([c.to, c.travelTime]); adj.get(c.to).push([c.from, c.travelTime]); });
  function shortest(a, b) {
    const dist = { [a]: 0 }; const pq = [[0, a]];
    while (pq.length) { pq.sort((x, y) => x[0] - y[0]); const [d, n] = pq.shift(); if (n === b) return d; for (const [m, w] of adj.get(n)) if (dist[m] === undefined || d + w < dist[m]) { dist[m] = d + w; pq.push([d + w, m]); } }
    return 24;
  }
  const ids = terminals.map((t) => t.id);
  const shipments = [];
  for (let i = 0; i < 100; i++) {
    const origin = pick(rng, ids);
    let destination = pick(rng, ids);
    while (destination === origin) destination = pick(rng, ids);
    const releaseTime = int(rng, 0, 72);
    const base = shortest(origin, destination);
    const deadline = releaseTime + base + int(rng, 4, 36);
    const r = rng();
    const priority = r < 0.12 ? 'critical' : r < 0.37 ? 'high' : r < 0.77 ? 'normal' : 'low';
    shipments.push({
      id: `S${String(i + 1).padStart(3, '0')}`, origin, destination,
      releaseTime, deadline, priority, cargo: pick(rng, CARGO), weightTons: int(rng, 40, 900),
    });
  }
  return { name: 'Seeded Network (8 terminals / 100 shipments)', terminals, connections, shipments, disruptions: [] };
}
