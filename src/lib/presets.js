import { generateDataset } from './generator.js';

export function referenceScenario() {
  return {
    name: 'Reference: Three-Terminal A–B–C (expected arrivals 10, 11, 12)',
    terminals: [
      { id: 'A', name: 'Terminal A', city: 'Alpha', x: 80, y: 180 },
      { id: 'B', name: 'Terminal B', city: 'Beta', x: 310, y: 180 },
      { id: 'C', name: 'Terminal C', city: 'Gamma', x: 540, y: 180 },
    ],
    connections: [
      { id: 'AB', from: 'A', to: 'B', bidirectional: true, travelTime: 1, capacity: 1 },
      { id: 'BC', from: 'B', to: 'C', bidirectional: true, travelTime: 1, capacity: 1 },
    ],
    shipments: [1, 2, 3].map((i) => ({ id: `R${i}`, origin: 'A', destination: 'C', releaseTime: 8, deadline: 30, priority: 'normal', cargo: 'Containers', weightTons: 100 })),
    disruptions: [],
    expected: 'Earliest feasible arrivals: R1 hour 10, R2 hour 11, R3 hour 12 (capacity 1/h on each leg serialises departures).',
  };
}

export function getPresets() {
  const base = generateDataset();
  const bottleneck = structuredClone(base); bottleneck.name = 'Preset: Capacity Bottleneck (Central Exchange links cut to 1/h)';
  bottleneck.connections = bottleneck.connections.map((c) => (['T5'].includes(c.from) || ['T5'].includes(c.to) ? { ...c, capacity: 1 } : c));
  const closure = structuredClone(base); closure.name = 'Preset: Connection Closure (T5–T6 closed hours 10–60)';
  closure.disruptions = [{ id: 'D1', type: 'closure', connectionId: closure.connections.find((c) => (c.from === 'T5' && c.to === 'T6') || (c.from === 'T6' && c.to === 'T5')).id, start: 10, end: 60 }];
  const disconnected = structuredClone(base); disconnected.name = 'Preset: Disconnected Network (T8 isolated)';
  disconnected.connections = disconnected.connections.filter((c) => c.from !== 'T8' && c.to !== 'T8');
  const tight = structuredClone(base); tight.name = 'Preset: Conflicting Deadlines (all deadlines = release + 6h)';
  tight.shipments = tight.shipments.map((s) => ({ ...s, deadline: s.releaseTime + 6 }));
  return [
    { id: 'normal', label: 'Normal Routing (seeded default)', data: base },
    { id: 'reference', label: 'Reference 3-Terminal (A–B–C, expected 10/11/12)', data: referenceScenario() },
    { id: 'bottleneck', label: bottleneck.name, data: bottleneck },
    { id: 'closure', label: closure.name, data: closure },
    { id: 'disconnected', label: disconnected.name, data: disconnected },
    { id: 'tight', label: tight.name, data: tight },
  ];
}
