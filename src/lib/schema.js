import { PRIORITIES } from './generator.js';
// Documented JSON schema v1:
// { version:1, name, terminals:[{id,name,x,y}], connections:[{id,from,to,travelTime,capacity}],
//   shipments:[{id,origin,destination,releaseTime,deadline,priority}], disruptions:[...] }
export function validateDataset(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Root value must be an object.'];
  if (data.version !== undefined && data.version !== 1) errors.push('Unsupported version (expected 1).');
  if (!Array.isArray(data.terminals) || !data.terminals.length) errors.push('terminals must be a non-empty array.');
  if (!Array.isArray(data.connections)) errors.push('connections must be an array.');
  if (!Array.isArray(data.shipments)) errors.push('shipments must be an array.');
  if (errors.length) return errors;
  const tids = new Set();
  data.terminals.forEach((t, i) => { if (!t.id) errors.push(`terminals[${i}] missing id`); if (tids.has(t.id)) errors.push(`Duplicate terminal id ${t.id}`); tids.add(t.id); });
  const cids = new Set();
  (data.connections || []).forEach((c, i) => {
    if (!c.id) errors.push(`connections[${i}] missing id`); if (cids.has(c.id)) errors.push(`Duplicate connection id ${c.id}`); cids.add(c.id);
    if (!tids.has(c.from) || !tids.has(c.to)) errors.push(`Connection ${c.id} references unknown terminal`);
    if (!(Number(c.travelTime) > 0)) errors.push(`Connection ${c.id} travelTime must be > 0`);
    if (!(Number(c.capacity) >= 0)) errors.push(`Connection ${c.id} capacity must be >= 0`);
  });
  const sids = new Set();
  (data.shipments || []).forEach((s, i) => {
    if (!s.id) errors.push(`shipments[${i}] missing id`); if (sids.has(s.id)) errors.push(`Duplicate shipment id ${s.id}`); sids.add(s.id);
    if (!tids.has(s.origin) || !tids.has(s.destination)) errors.push(`Shipment ${s.id} references unknown terminal`);
    if (!Number.isFinite(Number(s.releaseTime)) || !Number.isFinite(Number(s.deadline))) errors.push(`Shipment ${s.id} needs numeric releaseTime/deadline`);
    if (!PRIORITIES.includes(s.priority)) errors.push(`Shipment ${s.id} priority must be one of ${PRIORITIES.join(', ')}`);
  });
  (data.disruptions || []).forEach((d, i) => {
    if (!['closure', 'travel_increase', 'capacity_reduction', 'release_delay'].includes(d.type)) errors.push(`disruptions[${i}] unknown type`);
    if (d.type === 'closure' && !(Number(d.end) > Number(d.start))) errors.push(`disruptions[${i}] closure end must exceed start`);
  });
  return errors;
}
export function exportJSON(dataset) {
  return JSON.stringify({ version: 1, name: dataset.name || 'Scenario', terminals: dataset.terminals, connections: dataset.connections, shipments: dataset.shipments, disruptions: dataset.disruptions || [] }, null, 2);
}
export function importJSON(text) {
  let data; try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: [`Invalid JSON: ${e.message}`] }; }
  const errors = validateDataset(data);
  if (errors.length) return { ok: false, errors };
  data.terminals = data.terminals.map((t, i) => ({ city: t.city || '', x: Number(t.x ?? 80 + (i % 4) * 150), y: Number(t.y ?? 80 + Math.floor(i / 4) * 140), ...t }));
  data.connections = data.connections.map((c) => ({ ...c, bidirectional: true, travelTime: Number(c.travelTime), capacity: Number(c.capacity) }));
  data.shipments = data.shipments.map((s) => ({ cargo: 'General', weightTons: 100, ...s, releaseTime: Number(s.releaseTime), deadline: Number(s.deadline) }));
  data.disruptions = (data.disruptions || []).map((d, i) => ({ id: d.id || `D${i + 1}`, ...d }));
  return { ok: true, data };
}
