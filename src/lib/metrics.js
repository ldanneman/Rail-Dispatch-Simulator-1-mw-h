// All metrics derive from scheduler output only.
// Formulas (documented in UI + Obsidian docs):
//  onTimePct = onTime / delivered * 100 (undeliverable excluded from denominator)
//  avgDelay  = mean(max(0, arrival-deadline)) over delivered shipments
//  Terminal throughput = counts of leg departures (departures) and leg arrivals (arrivals) per terminal.
export function computeMetrics(dataset, run) {
  const byId = new Map(dataset.shipments.map((s) => [s.id, s]));
  const delivered = run.results.filter((r) => r.status !== 'undeliverable');
  const onTime = run.results.filter((r) => r.status === 'on-time');
  const late = run.results.filter((r) => r.status === 'late');
  const undeliverable = run.results.filter((r) => r.status === 'undeliverable');
  const avgDelay = delivered.length ? delivered.reduce((a, r) => a + r.delay, 0) / delivered.length : 0;
  const avgLateDelay = late.length ? late.reduce((a, r) => a + r.delay, 0) / late.length : 0;

  const connStats = dataset.connections.map((c) => {
    let total = 0; let peak = 0; const slots = {};
    for (const [k, v] of Object.entries(run.usage)) {
      const [cid, slot] = k.split('@');
      if (cid === c.id) { total += v; peak = Math.max(peak, v); slots[slot] = v; }
    }
    const eff = run.connectionsSnapshot.find((x) => x.id === c.id);
    const cap = eff ? eff.capacity : c.capacity;
    return { id: c.id, from: c.from, to: c.to, total, capacity: cap, travelTime: eff?.travelTime ?? c.travelTime,
      peakSlotUtilization: cap > 0 ? Math.round((peak / cap) * 100) : 0, slots };
  });
  const totalMovements = connStats.reduce((a, c) => a + c.total, 0);
  const totalCapacitySlots = connStats.reduce((a, c) => a + c.capacity * 24, 0); // first 24h reference window? use horizon below
  const throughput = dataset.terminals.map((t) => {
    let departures = 0; let arrivals = 0;
    for (const r of run.results) for (const leg of r.legs) { if (leg.from === t.id) departures++; if (leg.to === t.id) arrivals++; }
    return { id: t.id, name: t.name, departures, arrivals, total: departures + arrivals };
  });
  const alerts = [];
  connStats.filter((c) => c.peakSlotUtilization >= 100).forEach((c) => alerts.push({ level: 'high', message: `${c.id} (${c.from}–${c.to}) hits 100% capacity in at least one hourly slot — bottleneck.` }));
  connStats.filter((c) => c.peakSlotUtilization >= 80 && c.peakSlotUtilization < 100).forEach((c) => alerts.push({ level: 'medium', message: `${c.id} (${c.from}–${c.to}) peaks at ${c.peakSlotUtilization}% slot capacity.` }));
  late.forEach((r) => alerts.push({ level: 'medium', message: `${r.shipmentId} arrives ${r.delay}h late (hour ${r.arrivalTime}, deadline ${byId.get(r.shipmentId)?.deadline}).` }));
  undeliverable.forEach((r) => alerts.push({ level: 'high', message: `${r.shipmentId} undeliverable — ${r.reason}` }));
  (dataset.disruptions || []).forEach((d) => alerts.push({ level: 'high', message: `Active disruption: ${describeDisruption(d)}` }));

  return {
    total: run.results.length, delivered: delivered.length, onTime: onTime.length, late: late.length,
    undeliverable: undeliverable.length,
    onTimePct: delivered.length ? Math.round((onTime.length / delivered.length) * 1000) / 10 : 0,
    avgDelay: Math.round(avgDelay * 100) / 100, avgLateDelay: Math.round(avgLateDelay * 100) / 100,
    totalMovements, connStats, throughput, alerts,
    capacityUtilizationPct: totalMovements && connStats.length
      ? Math.round((totalMovements / connStats.reduce((a, c) => a + c.capacity * run.horizon, 0)) * 1000) / 10 : 0,
  };
}
export function describeDisruption(d) {
  if (d.type === 'closure') return `${d.connectionId} closed hours ${d.start}–${d.end}`;
  if (d.type === 'travel_increase') return `${d.connectionId} travel +${d.value}h`;
  if (d.type === 'capacity_reduction') return `${d.connectionId} capacity −${d.value}/h`;
  if (d.type === 'release_delay') return `${d.shipmentId} release delayed +${d.value}h`;
  return d.type;
}
export function diffRuns(baselineRun, scenarioRun, baselineData, scenarioData) {
  const b = new Map(baselineRun.results.map((r) => [r.shipmentId, r]));
  const rows = scenarioRun.results.map((r) => {
    const prev = b.get(r.shipmentId);
    if (!prev) return { shipmentId: r.shipmentId, change: 'new', prevArrival: null, arrival: r.arrivalTime, delta: null, rerouted: false, status: r.status, reason: r.reason };
    const rerouted = JSON.stringify(prev.route) !== JSON.stringify(r.route);
    const became = (prev.status !== 'undeliverable' && r.status === 'undeliverable') ? 'became-undeliverable'
      : (prev.status !== 'late' && r.status === 'late') ? 'became-late' : (prev.status !== r.status ? 'status-changed' : 'unchanged');
    return { shipmentId: r.shipmentId, change: became, prevArrival: prev.arrivalTime, arrival: r.arrivalTime,
      delta: prev.arrivalTime != null && r.arrivalTime != null ? r.arrivalTime - prev.arrivalTime : null, rerouted, status: r.status, reason: r.reason };
  });
  return { rows, affected: rows.filter((r) => r.change !== 'unchanged' || r.rerouted), rerouted: rows.filter((r) => r.rerouted) };
}
