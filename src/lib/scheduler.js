import { HORIZON, PRIORITY_WEIGHT } from './generator.js';

/**
 * Greedy priority-ordered, time-dependent earliest-arrival scheduler.
 *
 * Why this algorithm: capacity reservations make the joint problem NP-hard in
 * general (job-shop-like). A sequential greedy scheduler that (a) orders by
 * priority/deadline/release/id and (b) routes each shipment with a
 * time-dependent Dijkstra whose edge function waits for the earliest
 * capacity-feasible, closure-free departure slot is deterministic, always
 * feasible by construction (it only ever books free slots), easy to audit,
 * and prioritises urgent freight. It is NOT claimed globally optimal.
 *
 * Capacity: max movements ENTERING a connection per 1-hour departure slot.
 * Bidirectional connections share one slot pool across both directions.
 * Closure: a movement may not depart if [depart, depart+travel) overlaps
 * [closureStart, closureEnd). Times are integer hours.
 */

export function effectiveConnections(connections, disruptions = []) {
  return connections.map((c) => {
    let travelTime = c.travelTime; let capacity = c.capacity;
    const closures = [];
    for (const d of disruptions) {
      if (d.connectionId !== c.id) continue;
      if (d.type === 'closure') closures.push({ start: d.start, end: d.end });
      if (d.type === 'travel_increase') travelTime += Number(d.value || 0);
      if (d.type === 'capacity_reduction') capacity = Math.max(0, capacity - Number(d.value || 0));
    }
    return { ...c, travelTime, capacity, closures };
  });
}

export function effectiveShipments(shipments, disruptions = []) {
  return shipments.map((s) => {
    let releaseTime = s.releaseTime;
    for (const d of disruptions) if (d.type === 'release_delay' && d.shipmentId === s.id) releaseTime += Number(d.value || 0);
    return { ...s, releaseTime };
  });
}

function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }

function earliestDeparture(conn, ready, used) {
  // earliest d >= ready with free slot capacity and no closure overlap; null if arrival would exceed horizon
  for (let d = ready; d <= HORIZON; d++) {
    if (conn.capacity <= 0) return null;
    const key = `${conn.id}@${d}`;
    if ((used.get(key) || 0) >= conn.capacity) continue;
    const arr = d + conn.travelTime;
    if (arr > HORIZON) return null;
    if (conn.closures.some((cl) => overlaps(d, arr, cl.start, cl.end))) continue;
    return d;
  }
  return null;
}

function staticReachable(terminals, connections, origin, destination) {
  const adj = new Map(terminals.map((t) => [t.id, []]));
  connections.forEach((c) => { if (adj.has(c.from)) adj.get(c.from).push(c.to); if (adj.has(c.to)) adj.get(c.to).push(c.from); });
  const seen = new Set([origin]); const q = [origin];
  while (q.length) { const n = q.shift(); if (n === destination) return true; for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); q.push(m); } }
  return false;
}

export function scheduleShipment(shipment, terminals, connections, used) {
  const { origin, destination, releaseTime } = shipment;
  if (origin === destination) return { status: 'scheduled', legs: [], arrivalTime: releaseTime, departureTime: releaseTime };
  // Time-dependent Dijkstra. State ordered by (arrival, hops, pathString) for deterministic tie-breaks.
  const adj = new Map(terminals.map((t) => [t.id, []]));
  connections.forEach((c) => { adj.get(c.from)?.push({ to: c.to, conn: c }); adj.get(c.to)?.push({ to: c.from, conn: c }); });
  adj.forEach((list) => list.sort((a, b) => a.conn.id.localeCompare(b.conn.id) || a.to.localeCompare(b.to)));

  const best = new Map(); // node -> {time,hops,pathKey}
  const prev = new Map(); // node -> {fromNode, leg}
  const startKey = '';
  best.set(origin, { time: releaseTime, hops: 0, pathKey: origin });
  const open = [{ node: origin, time: releaseTime, hops: 0, pathKey: origin }];
  const better = (a, b) => a.time < b.time || (a.time === b.time && (a.hops < b.hops || (a.hops === b.hops && a.pathKey < b.pathKey)));
  while (open.length) {
    open.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    const cur = open.shift();
    const known = best.get(cur.node);
    if (!known || cur.time !== known.time || cur.hops !== known.hops || cur.pathKey !== known.pathKey) continue;
    if (cur.node === destination) break;
    for (const { to, conn } of adj.get(cur.node) || []) {
      const dep = earliestDeparture(conn, cur.time, used);
      if (dep === null) continue;
      const arr = dep + conn.travelTime;
      const cand = { time: arr, hops: cur.hops + 1, pathKey: `${cur.pathKey}>${to}` };
      const ex = best.get(to);
      if (!ex || better(cand, ex)) {
        best.set(to, cand);
        prev.set(to, { fromNode: cur.node, leg: { connectionId: conn.id, from: cur.node, to, depart: dep, arrive: arr, travelTime: conn.travelTime, waitBefore: dep - cur.time } });
        open.push({ node: to, ...cand });
      }
    }
  }
  if (!best.has(destination)) {
    const reachable = staticReachable(terminals, connections, origin, destination);
    return {
      status: 'undeliverable', legs: [], arrivalTime: null,
      reason: !reachable
        ? `No route exists: ${destination} is disconnected from ${origin} in the current network.`
        : `No feasible schedule within the ${HORIZON}h (7-day) horizon — capacity is exhausted or closures block every route before the horizon.`,
    };
  }
  const legs = [];
  let node = destination;
  while (node !== origin) { const p = prev.get(node); legs.unshift(p.leg); node = p.fromNode; }
  return { status: 'scheduled', legs, arrivalTime: best.get(destination).time, departureTime: legs[0].depart };
}

export function runScheduler(dataset) {
  const connections = effectiveConnections(dataset.connections, dataset.disruptions || []);
  const shipments = effectiveShipments(dataset.shipments, dataset.disruptions || []);
  const connById = new Map(connections.map((c) => [c.id, c]));
  const used = new Map(); // "C1@8" -> count (shared both directions)
  const order = [...shipments].sort((a, b) =>
    (PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]) ||
    (a.deadline - b.deadline) || (a.releaseTime - b.releaseTime) || a.id.localeCompare(b.id));

  const results = new Map();
  for (const s of order) {
    const r = scheduleShipment(s, dataset.terminals, connections, used);
    if (r.status === 'scheduled') {
      for (const leg of r.legs) { const k = `${leg.connectionId}@${leg.depart}`; used.set(k, (used.get(k) || 0) + 1); }
      const late = r.arrivalTime > s.deadline;
      results.set(s.id, {
        shipmentId: s.id, status: late ? 'late' : 'on-time', legs: r.legs,
        arrivalTime: r.arrivalTime, departureTime: r.departureTime,
        delay: Math.max(0, r.arrivalTime - s.deadline), totalWait: r.legs.reduce((a, l) => a + l.waitBefore, 0),
        route: [s.origin, ...r.legs.map((l) => l.to)], reason: null,
      });
    } else {
      results.set(s.id, { shipmentId: s.id, status: 'undeliverable', legs: [], arrivalTime: null, departureTime: null, delay: null, totalWait: 0, route: [s.origin], reason: r.reason });
    }
  }
  const usage = {};
  for (const [k, v] of used) usage[k] = v;
  return {
    results: dataset.shipments.map((s) => results.get(s.id)),
    order: order.map((s) => s.id),
    usage, horizon: HORIZON,
    connectionsSnapshot: connections.map((c) => ({ id: c.id, from: c.from, to: c.to, travelTime: c.travelTime, capacity: c.capacity, closures: c.closures })),
    connById: Object.fromEntries(connById),
  };
}
