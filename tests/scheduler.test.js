import { describe, it, expect } from 'vitest';
import { generateDataset } from '../src/lib/generator.js';
import { runScheduler } from '../src/lib/scheduler.js';
import { referenceScenario } from '../src/lib/presets.js';
import { validateDataset, importJSON } from '../src/lib/schema.js';
import { saveState, loadState, clearState, STORAGE_KEY } from '../src/lib/storage.js';
import { computeMetrics } from '../src/lib/metrics.js';

function assertInvariants(dataset, run) {
  const byId = new Map(dataset.shipments.map((s) => [s.id, s]));
  const effDelay = new Map();
  (dataset.disruptions || []).filter((d) => d.type === 'release_delay').forEach((d) => effDelay.set(d.shipmentId, (effDelay.get(d.shipmentId) || 0) + d.value));
  for (const r of run.results) {
    const s = byId.get(r.shipmentId); const release = s.releaseTime + (effDelay.get(s.id) || 0);
    for (const leg of r.legs) expect(leg.depart).toBeGreaterThanOrEqual(release);
    // arrival math across legs
    r.legs.forEach((leg, i) => {
      expect(leg.arrive).toBe(leg.depart + leg.travelTime);
      if (i) expect(leg.depart).toBeGreaterThanOrEqual(r.legs[i - 1].arrive);
    });
    if (r.arrivalTime != null && r.legs.length) expect(r.arrivalTime).toBe(r.legs[r.legs.length - 1].arrive);
  }
  for (const snap of run.connectionsSnapshot)
    for (let h = 0; h <= 168; h++) expect(run.usage[`${snap.id}@${h}`] || 0).toBeLessThanOrEqual(snap.capacity);
}

describe('reference 3-terminal scenario', () => {
  it('produces arrivals 10, 11, 12 without violating capacity', () => {
    const data = referenceScenario(); const run = runScheduler(data);
    expect(run.results.map((r) => r.arrivalTime)).toEqual([10, 11, 12]);
    assertInvariants(data, run);
  });
  it('closure of B-C hours 8-10 delays but still routes', () => {
    const data = referenceScenario(); data.disruptions = [{ id: 'D1', type: 'closure', connectionId: 'BC', start: 8, end: 10 }];
    const run = runScheduler(data);
    // first movement A-B dep 8 arr 9, cannot traverse BC overlapping [8,10): earliest BC dep 10 arr 11
    expect(run.results[0].arrivalTime).toBe(11);
    for (const r of run.results) for (const l of r.legs) if (l.connectionId === 'BC') expect(l.depart >= 10 || l.arrive <= 8).toBe(true);
    assertInvariants(data, run);
  });
});

describe('seeded network', () => {
  it('has 8 terminals, >=14 connections, 100 shipments and is deterministic', () => {
    const a = generateDataset(); const b = generateDataset();
    expect(a.terminals).toHaveLength(8); expect(a.connections.length).toBeGreaterThanOrEqual(14); expect(a.shipments).toHaveLength(100);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const r1 = runScheduler(a); const r2 = runScheduler(generateDataset());
    expect(JSON.stringify(r1.results)).toBe(JSON.stringify(r2.results));
    assertInvariants(a, r1);
  });
  it('never departs before release, capacity never exceeded (invariants)', () => {
    const data = generateDataset(); assertInvariants(data, runScheduler(data));
  });
  it('disconnected terminal is correctly undeliverable with reason', () => {
    const data = referenceScenario(); data.connections = data.connections.filter((c) => c.id !== 'BC');
    const run = runScheduler(data);
    expect(run.results.every((r) => r.status === 'undeliverable' && /disconnected|No route/.test(r.reason))).toBe(true);
  });
  it('tight deadlines classify as late, not undeliverable', () => {
    const data = referenceScenario(); data.shipments = data.shipments.map((s) => ({ ...s, deadline: 9 }));
    const run = runScheduler(data);
    expect(run.results.every((r) => r.status === 'late')).toBe(true);
  });
  it('capacity reduction serialises further', () => {
    const data = referenceScenario(); data.connections[0].capacity = 1; data.shipments.push({ id: 'R4', origin: 'A', destination: 'C', releaseTime: 8, deadline: 99, priority: 'low', cargo: 'X', weightTons: 1 });
    const run = runScheduler(data); expect(run.results.map((r) => r.arrivalTime)).toEqual([10, 11, 12, 13]); assertInvariants(data, run);
  });
});

describe('scenario isolation & persistence', () => {
  it('replanning a copy does not modify baseline', () => {
    const baseline = generateDataset(); const before = JSON.stringify(runScheduler(baseline).results);
    const scenario = structuredClone(baseline); scenario.disruptions = [{ id: 'D1', type: 'closure', connectionId: scenario.connections[0].id, start: 0, end: 100 }];
    runScheduler(scenario);
    expect(JSON.stringify(baseline)).toBe(JSON.stringify(generateDataset()));
    expect(JSON.stringify(runScheduler(baseline).results)).toBe(before);
  });
  it('persistence round-trips through storage (reload simulation)', () => {
    const mem = {}; const fake = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const data = generateDataset(); saveState({ dataset: data, baselineData: data }, fake);
    expect(loadState(fake).dataset.shipments).toHaveLength(100);
    clearState(fake); expect(loadState(fake)).toBeNull(); expect(STORAGE_KEY).toContain('rail');
  });
  it('metrics are derived: onTimePct matches raw results', () => {
    const data = generateDataset(); const run = runScheduler(data); const m = computeMetrics(data, run);
    const delivered = run.results.filter((r) => r.status !== 'undeliverable').length;
    expect(m.onTime + m.late).toBe(delivered); expect(m.undeliverable + delivered).toBe(100);
  });
  it('import validation rejects malformed data gracefully', () => {
    expect(importJSON('{bad json').ok).toBe(false);
    expect(importJSON(JSON.stringify({ version: 1, terminals: [], connections: [], shipments: [] })).ok).toBe(false);
    expect(validateDataset(referenceScenario()).length).toBe(0);
    const bad = referenceScenario(); bad.shipments[0].origin = 'ZZ'; expect(validateDataset(bad).length).toBeGreaterThan(0);
    const good = importJSON(JSON.stringify({ version: 1, ...referenceScenario() })); expect(good.ok).toBe(true);
  });
});
