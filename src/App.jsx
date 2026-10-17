import React, { useEffect, useMemo, useState } from 'react';
import { generateDataset, PRIORITIES } from './lib/generator.js';
import { runScheduler } from './lib/scheduler.js';
import { computeMetrics, diffRuns, describeDisruption } from './lib/metrics.js';
import { getPresets } from './lib/presets.js';
import { exportJSON, importJSON } from './lib/schema.js';
import { saveState, loadState, clearState } from './lib/storage.js';

const clone = (o) => structuredClone(o);
const TABS = ['Dashboard', 'Network', 'Shipments', 'Timeline', 'Test Lab', 'Capacity', 'Compare', 'Docs'];

export default function App() {
  const presets = useMemo(getPresets, []);
  const [tab, setTab] = useState('Dashboard');
  const [dataset, setDataset] = useState(() => loadState()?.dataset || generateDataset());
  const [baselineData, setBaselineData] = useState(() => loadState()?.baselineData || generateDataset());
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all'); const [sortKey, setSortKey] = useState('id'); const [sortDir, setSortDir] = useState(1);
  const [capConn, setCapConn] = useState(null);
  const [importText, setImportText] = useState(''); const [msg, setMsg] = useState('');
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => { saveState({ dataset, baselineData }); }, [dataset, baselineData]);
  const run = useMemo(() => runScheduler(dataset), [dataset, runNonce]);
  const metrics = useMemo(() => computeMetrics(dataset, run), [dataset, run]);
  const baselineRun = useMemo(() => runScheduler(baselineData), [baselineData]);
  const baselineMetrics = useMemo(() => computeMetrics(baselineData, baselineRun), [baselineData, baselineRun]);
  const diff = useMemo(() => diffRuns(baselineRun, run, baselineData, dataset), [baselineRun, run, baselineData, dataset]);
  const resultById = useMemo(() => new Map(run.results.map((r) => [r.shipmentId, r])), [run]);
  const selectedResult = selected ? resultById.get(selected) : null;
  const selectedShipment = dataset.shipments.find((s) => s.id === selected);
  const routeConns = new Set((selectedResult?.legs || []).map((l) => l.connectionId));

  const update = (fn) => setDataset((d) => { const n = clone(d); fn(n); return n; });
  const resetSeeded = () => { const d = generateDataset(); setDataset(d); setBaselineData(clone(d)); setMsg('Reset to original seeded state (seed 20261017). Baseline restored too.'); };
  const snapshotBaseline = () => { setBaselineData(clone({ ...dataset, disruptions: [] })); setMsg('Baseline snapshotted from current network/shipments without disruptions. It will not change when you edit the scenario.'); };

  const filtered = dataset.shipments.filter((s) => {
    const r = resultById.get(s.id);
    return (!query || `${s.id} ${s.origin} ${s.destination} ${s.cargo || ''}`.toLowerCase().includes(query.toLowerCase()))
      && (statusFilter === 'all' || r?.status === statusFilter) && (priorityFilter === 'all' || s.priority === priorityFilter);
  }).sort((a, b) => {
    const ra = resultById.get(a.id); const rb = resultById.get(b.id);
    const va = sortKey === 'arrival' ? (ra?.arrivalTime ?? 9999) : a[sortKey]; const vb = sortKey === 'arrival' ? (rb?.arrivalTime ?? 9999) : b[sortKey];
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
  });
  const allLegs = run.results.flatMap((r) => r.legs.map((l) => ({ ...l, shipmentId: r.shipmentId }))).sort((a, b) => a.depart - b.depart || a.shipmentId.localeCompare(b.shipmentId));
  const pos = new Map(dataset.terminals.map((t) => [t.id, t]));

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 20 }}>
      <header>
        <div className="muted">FREIGHT RAIL LOGISTICS • DETERMINISTIC SIMULATION • SEED 20261017 • HORIZON 168H</div>
        <h1 style={{ margin: '6px 0' }}>Rail Network Dispatch &amp; Optimization Simulator</h1>
        <p className="muted" style={{ fontSize: 14 }}>{dataset.name} — {dataset.terminals.length} terminals · {dataset.connections.length} connections · {dataset.shipments.length} shipments. Capacity = max movements <b>entering</b> a connection per 1-hour departure slot (bidirectional connections share the pool). All metrics below are computed from the live scheduler — nothing is hardcoded.</p>
        {msg && <div className="card" style={{ borderColor: '#0ea5e9' }}>{msg}</div>}
      </header>

      <div className="grid" style={{ marginTop: 12 }}>
        {[['On-time', `${metrics.onTimePct}%`, `${metrics.onTime}/${metrics.delivered} delivered on time`], ['Late', metrics.late, 'delivered after deadline'], ['Undeliverable', metrics.undeliverable, 'no feasible route in 168h'], ['Avg delay (delivered)', `${metrics.avgDelay}h`, 'mean max(0, arrival−deadline)'], ['Movements', metrics.totalMovements, 'total leg departures booked'], ['Network slot utilisation', `${metrics.capacityUtilizationPct}%`, 'movements / (capacity × 168h), all links']].map(([k, v, s]) => (
          <div className="card" key={k}><div className="muted">{k}</div><div className="kpi">{v}</div><div className="muted">{s}</div></div>
        ))}
      </div>

      <nav className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'active' : 'ghost'} onClick={() => setTab(t)}>{t}</button>)}</nav>

      {tab === 'Dashboard' && (<div style={{ display: 'grid', gap: 12 }}>
        <div className="card"><h3>Operational Alerts &amp; Bottlenecks ({metrics.alerts.length})</h3><div className="scroll" style={{ maxHeight: 260 }}>{metrics.alerts.length ? metrics.alerts.map((a, i) => <div key={i} style={{ padding: '4px 0' }}><span className={`badge ${a.level === 'high' ? 'undeliverable' : 'late'}`}>{a.level}</span> {a.message}</div>) : <span className="muted">No alerts — no bottlenecks, late, or undeliverable shipments.</span>}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12 }}>
          <div className="card"><h3>Terminal Throughput (arrivals / departures)</h3><table><thead><tr><th>Terminal</th><th>Departures</th><th>Arrivals</th><th>Total</th></tr></thead><tbody>{metrics.throughput.map((t) => <tr key={t.id}><td>{t.id} {t.name}</td><td>{t.departures}</td><td>{t.arrivals}</td><td>{t.total}</td></tr>)}</tbody></table><p className="muted">Throughput is a count, not a %, because no terminal handling capacity is modelled.</p></div>
          <div className="card"><h3>Connection Utilisation</h3>{metrics.connStats.map((c) => <div key={c.id} style={{ marginBottom: 8 }}><div className="row" style={{ justifyContent: 'space-between' }}><span>{c.id} {c.from}–{c.to} · {c.total} moves · cap {c.capacity}/h · travel {c.travelTime}h</span><b>{c.peakSlotUtilization}% peak slot</b></div><div className="bar"><i style={{ width: `${c.peakSlotUtilization}%` }} /></div></div>)}</div>
        </div>
      </div>)}

      {tab === 'Network' && (<div className="card"><h3>Network Map — click a shipment in Shipments to highlight its route</h3>
        <svg viewBox="0 0 620 480" style={{ width: '100%', background: '#0f172a', borderRadius: 10 }}>
          {dataset.connections.map((c) => { const a = pos.get(c.from); const b = pos.get(c.to); if (!a || !b) return null; const hot = routeConns.has(c.id); return <g key={c.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? '#f59e0b' : '#334155'} strokeWidth={hot ? 5 : 2} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} fill="#93c5fd" fontSize="10">{c.id} · {c.travelTime}h · {c.capacity}/h</text></g>; })}
          {dataset.terminals.map((t) => <g key={t.id}><circle cx={t.x} cy={t.y} r="16" fill="#1d4ed8" stroke="#7dd3fc" /><text x={t.x} y={t.y + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{t.id}</text><text x={t.x} y={t.y + 32} textAnchor="middle" fill="#cbd5e1" fontSize="10">{t.name}</text></g>)}
        </svg>
        {selectedResult && <ShipmentDetail shipment={selectedShipment} result={selectedResult} />}
      </div>)}

      {tab === 'Shipments' && (<div className="card"><div className="row">
        <input placeholder="Search id / origin / destination / cargo" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 260 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option>on-time</option><option>late</option><option>undeliverable</option></select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
        <span className="muted">{filtered.length} shown — click a row for full leg-by-leg schedule</span></div>
        <div className="scroll"><table><thead><tr>{[['id', 'ID'], ['origin', 'Origin'], ['destination', 'Dest'], ['releaseTime', 'Release'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['arrival', 'Arrival']].map(([k, l]) => <th key={k} onClick={() => { setSortKey(k); setSortDir(sortKey === k ? -sortDir : 1); }}>{l} ↕</th>)}<th>Status</th><th>Route</th></tr></thead>
        <tbody>{filtered.map((s) => { const r = resultById.get(s.id); return <tr key={s.id} onClick={() => setSelected(s.id)} style={{ cursor: 'pointer', background: selected === s.id ? '#1e3a5f' : undefined }}><td>{s.id}</td><td>{s.origin}</td><td>{s.destination}</td><td>{s.releaseTime}h</td><td>{s.deadline}h</td><td>{s.priority}</td><td>{r?.arrivalTime ?? '—'}</td><td><span className={`badge ${r?.status}`}>{r?.status}</span></td><td>{r?.route.join(' → ')}</td></tr>; })}</tbody></table></div>
        {selectedResult && <ShipmentDetail shipment={selectedShipment} result={selectedResult} />}
      </div>)}

      {tab === 'Timeline' && (<div className="card"><h3>Scheduled Movements Timeline ({allLegs.length} legs, hour 0–168)</h3><div className="scroll"><table><thead><tr><th>Shipment</th><th>Connection</th><th>From</th><th>To</th><th>Depart</th><th>Arrive</th><th>Wait before</th><th>Bar (depart → arrive)</th></tr></thead><tbody>{allLegs.map((l, i) => <tr key={i}><td>{l.shipmentId}</td><td>{l.connectionId}</td><td>{l.from}</td><td>{l.to}</td><td>{l.depart}h</td><td>{l.arrive}h</td><td>{l.waitBefore}h</td><td><div className="bar" style={{ width: 220 }}><i style={{ marginLeft: `${(l.depart / 168) * 100}%`, width: `${Math.max(2, ((l.arrive - l.depart) / 168) * 100)}%` }} /></div></td></tr>)}</tbody></table></div></div>)}

      {tab === 'Test Lab' && (<TestLab dataset={dataset} update={update} setDataset={setDataset} presets={presets} onRun={() => setRunNonce((n) => n + 1)} onReset={resetSeeded} onBaseline={snapshotBaseline} importText={importText} setImportText={setImportText} setMsg={setMsg} resultById={resultById} setSelected={(id) => { setSelected(id); setTab('Shipments'); }} />)}

      {tab === 'Capacity' && (<div className="card"><h3>Capacity Inspection — verify no hourly slot is ever over capacity</h3>
        <div className="row"><select value={capConn || dataset.connections[0]?.id || ''} onChange={(e) => setCapConn(e.target.value)}>{dataset.connections.map((c) => <option key={c.id} value={c.id}>{c.id} {c.from}–{c.to} (cap {run.connectionsSnapshot.find((x) => x.id === c.id)?.capacity}/h)</option>)}</select>
        <span className="muted">Capacity counts movements entering the connection in that departure hour, both directions combined.</span></div>
        <CapacityGrid run={run} connId={capConn || dataset.connections[0]?.id} /></div>)}

      {tab === 'Compare' && (<div style={{ display: 'grid', gap: 12 }}>
        <div className="card"><h3>Baseline vs Current Scenario</h3><p className="muted">Baseline is an immutable snapshot (use “Snapshot as Baseline” in Test Lab). Editing the scenario never rewrites it — verified by automated tests.</p>
        <table><thead><tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Δ</th></tr></thead><tbody>
          {[['On-time %', baselineMetrics.onTimePct, metrics.onTimePct], ['Average delay (h, delivered)', baselineMetrics.avgDelay, metrics.avgDelay], ['Capacity utilisation %', baselineMetrics.capacityUtilizationPct, metrics.capacityUtilizationPct], ['Rerouted shipments', 0, diff.rerouted.length], ['Undeliverable', baselineMetrics.undeliverable, metrics.undeliverable], ['Late', baselineMetrics.late, metrics.late]].map(([k, a, b]) => <tr key={k}><td>{k}</td><td>{a}</td><td>{b}</td><td>{typeof b === 'number' && typeof a === 'number' ? Math.round((b - a) * 100) / 100 : '—'}</td></tr>)}
        </tbody></table></div>
        <div className="card"><h3>Affected Shipments ({diff.affected.length})</h3><div className="scroll"><table><thead><tr><th>Shipment</th><th>Change</th><th>Rerouted</th><th>Arrival before → after</th><th>Δh</th><th>Reason</th></tr></thead><tbody>{diff.affected.map((r) => <tr key={r.shipmentId}><td>{r.shipmentId}</td><td>{r.change}</td><td>{r.rerouted ? 'yes' : 'no'}</td><td>{r.prevArrival ?? '—'} → {r.arrival ?? '—'}</td><td>{r.delta ?? '—'}</td><td>{r.reason || '—'}</td></tr>)}</tbody></table></div></div>
        <DisruptionEditor dataset={dataset} update={update} />
      </div>)}

      {tab === 'Docs' && (<div className="card"><h3>How it works</h3>
        <p><b>Algorithm:</b> shipments are ordered by priority (critical &gt; high &gt; normal &gt; low), then deadline, release, and ID. Each is routed in turn with a time-dependent Dijkstra that finds the earliest-arrival path where every leg departs in a slot with free capacity and does not overlap a closure. Booked slots are reserved immediately, so capacity can never be exceeded. This greedy sequential scheme is deterministic and feasible-by-construction; it is not claimed to be globally optimal (the joint problem is NP-hard-like).</p>
        <p><b>Rules:</b> integer hours; horizon 168h (7 days); late = delivered after deadline (not undeliverable); undeliverable only when no feasible schedule exists within the horizon; closures block any traversal overlapping [start, end); tie-breaks: earlier arrival, fewer hops, lexicographically smallest path.</p>
        <p><b>Metrics:</b> on-time % = on-time ÷ delivered (undeliverable excluded); avg delay = mean of max(0, arrival − deadline) over delivered shipments; terminal throughput = raw arrival/departure counts.</p>
        <p><b>JSON schema v1:</b> <code>{`{version:1, name, terminals:[{id,name,x,y}], connections:[{id,from,to,travelTime,capacity}], shipments:[{id,origin,destination,releaseTime,deadline,priority}], disruptions:[{id,type,connectionId|shipmentId,start,end,value}]}`}</code>. Imports are validated (unique IDs, known terminals, positive travel time, valid priorities) and rejected with listed errors if malformed.</p>
        <p><b>Reference scenario:</b> load the A–B–C preset in the Test Lab. Expected arrivals are hours 10, 11, 12 — covered by an automated Vitest test.</p>
      </div>)}

      <footer className="muted" style={{ marginTop: 18 }}>Run: <code>yarn dev</code> · Test: <code>yarn test</code> · Build: <code>yarn build</code>. Changes persist in localStorage; “Reset to seeded” restores the original deterministic dataset.</footer>
    </div>
  );
}

function ShipmentDetail({ shipment, result }) {
  if (!shipment || !result) return null;
  return <div style={{ marginTop: 14, borderTop: '1px solid #334155', paddingTop: 12 }}><h4>{shipment.id}: {shipment.origin} → {shipment.destination} · {shipment.cargo || 'General'} · {shipment.weightTons || '—'}t · priority {shipment.priority} · release {shipment.releaseTime}h · deadline {shipment.deadline}h</h4>
    <p>Status <span className={`badge ${result.status}`}>{result.status}</span> · Route {result.route.join(' → ')} · Arrival {result.arrivalTime ?? '—'}h · Total waiting {result.totalWait}h {result.reason && <>· Reason: {result.reason}</>}</p>
    <table><thead><tr><th>Leg</th><th>Connection</th><th>From</th><th>To</th><th>Wait</th><th>Depart</th><th>Arrive</th></tr></thead><tbody>{result.legs.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.connectionId}</td><td>{l.from}</td><td>{l.to}</td><td>{l.waitBefore}h</td><td>{l.depart}h</td><td>{l.arrive}h</td></tr>)}</tbody></table></div>;
}

function CapacityGrid({ run, connId }) {
  if (!connId) return <p className="muted">No connections.</p>;
  const snap = run.connectionsSnapshot.find((c) => c.id === connId);
  const rows = Array.from({ length: 168 }, (_, h) => ({ h, used: run.usage[`${connId}@${h}`] || 0 }));
  const usedRows = rows.filter((r) => r.used > 0);
  return <div><p className="muted">Showing all 168 hourly slots with usage for {connId} (cap {snap?.capacity}/h, travel {snap?.travelTime}h). Full 168-slot check: {rows.every((r) => r.used <= (snap?.capacity ?? 0)) ? '✓ capacity never exceeded in any slot' : '✗ VIOLATION'}.</p>
    <div className="scroll" style={{ maxHeight: 300 }}><table><thead><tr><th>Hour</th><th>Used</th><th>Capacity</th><th>Utilisation</th></tr></thead><tbody>{usedRows.length ? usedRows.map((r) => <tr key={r.h}><td>{r.h}h</td><td>{r.used}</td><td>{snap.capacity}</td><td>{Math.round((r.used / snap.capacity) * 100)}%</td></tr>) : <tr><td colSpan="4">No movements booked on this connection.</td></tr>}</tbody></table></div></div>;
}

function DisruptionEditor({ dataset, update }) {
  const [form, setForm] = useState({ type: 'closure', connectionId: '', shipmentId: '', start: 10, end: 40, value: 2 });
  const add = () => update((n) => { n.disruptions = n.disruptions || []; n.disruptions.push({ id: `D${Date.now()}`, ...form, connectionId: form.connectionId || n.connections[0]?.id, shipmentId: form.shipmentId || n.shipments[0]?.id, start: Number(form.start), end: Number(form.end), value: Number(form.value) }); });
  return <div className="card"><h3>Disruption Simulation</h3><div className="row">
    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="closure">Close connection</option><option value="travel_increase">Increase travel time</option><option value="capacity_reduction">Reduce capacity</option><option value="release_delay">Delay shipment release</option></select>
    {form.type === 'release_delay' ? <select value={form.shipmentId} onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}>{dataset.shipments.map((s) => <option key={s.id}>{s.id}</option>)}</select>
      : <select value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>{dataset.connections.map((c) => <option key={c.id} value={c.id}>{c.id} {c.from}–{c.to}</option>)}</select>}
    {form.type === 'closure' && <><label>Start <input type="number" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} style={{ width: 70 }} /></label><label>End <input type="number" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} style={{ width: 70 }} /></label></>}
    {form.type !== 'closure' && <label>Value (hours / capacity) <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} style={{ width: 70 }} /></label>}
    <button onClick={add}>Add disruption &amp; recalculate</button></div>
    <div style={{ marginTop: 10 }}>{(dataset.disruptions || []).map((d) => <div key={d.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{describeDisruption(d)}</span><button className="danger" onClick={() => update((n) => { n.disruptions = n.disruptions.filter((x) => x.id !== d.id); })}>Remove</button></div>)}{!(dataset.disruptions || []).length && <span className="muted">No active disruptions. Add one, then open Compare to see affected / rerouted shipments and arrival changes.</span>}</div></div>;
}

function TestLab({ dataset, update, setDataset, presets, onRun, onReset, onBaseline, importText, setImportText, setMsg, resultById, setSelected }) {
  const doImport = (text) => { const r = importJSON(text); if (!r.ok) { setMsg(`Import rejected — ${r.errors.join('; ')}`); return; } setDataset(r.data); setMsg(`Imported “${r.data.name}” successfully (${r.data.shipments.length} shipments).`); };
  return <div style={{ display: 'grid', gap: 12 }}>
    <div className="card"><h3>Preset Scenarios &amp; Controls</h3><div className="row">
      {presets.map((p) => <button key={p.id} className="ghost" onClick={() => { setDataset(structuredClone(p.data)); setMsg(`Loaded preset: ${p.label}${p.data.expected ? ` — Expected: ${p.data.expected}` : ''}`); }}>{p.label}</button>)}
    </div><div className="row" style={{ marginTop: 10 }}>
      <button onClick={onRun}>▶ Run / Recalculate</button><button className="ghost" onClick={onBaseline}>Snapshot as Baseline (immutable)</button><button className="ghost" onClick={onReset}>Reset to Seeded Default</button>
      <span className="muted">Scheduling is instantaneous (playback/animation is optional per spec), so Run recomputes immediately and deterministically. Every edit below also recalculates live.</span></div></div>

    <DisruptionEditor dataset={dataset} update={update} />

    <div className="card"><h3>Network Editor — Terminals</h3><div className="scroll" style={{ maxHeight: 240 }}><table><thead><tr><th>ID</th><th>Name</th><th>X</th><th>Y</th><th></th></tr></thead><tbody>{dataset.terminals.map((t, i) => <tr key={t.id}><td>{t.id}</td><td><input value={t.name} onChange={(e) => update((n) => { n.terminals[i].name = e.target.value; })} /></td><td><input type="number" value={t.x} style={{ width: 60 }} onChange={(e) => update((n) => { n.terminals[i].x = Number(e.target.value); })} /></td><td><input type="number" value={t.y} style={{ width: 60 }} onChange={(e) => update((n) => { n.terminals[i].y = Number(e.target.value); })} /></td><td><button className="danger" onClick={() => update((n) => { n.terminals = n.terminals.filter((x) => x.id !== t.id); n.connections = n.connections.filter((c) => c.from !== t.id && c.to !== t.id); n.shipments = n.shipments.filter((s) => s.origin !== t.id && s.destination !== t.id); })}>Delete</button></td></tr>)}</tbody></table></div>
      <button onClick={() => update((n) => { const id = `T${Math.max(0, ...n.terminals.map((t) => parseInt(String(t.id).replace(/\D/g, '')) || 0)) + 1}`; n.terminals.push({ id, name: `Terminal ${id}`, city: '', x: 120, y: 120 }); })}>+ Add Terminal</button></div>

    <div className="card"><h3>Network Editor — Connections</h3><div className="scroll" style={{ maxHeight: 260 }}><table><thead><tr><th>ID</th><th>From</th><th>To</th><th>Travel (h)</th><th>Capacity/h</th><th></th></tr></thead><tbody>{dataset.connections.map((c, i) => <tr key={c.id}><td>{c.id}</td>
      <td><select value={c.from} onChange={(e) => update((n) => { n.connections[i].from = e.target.value; })}>{dataset.terminals.map((t) => <option key={t.id}>{t.id}</option>)}</select></td>
      <td><select value={c.to} onChange={(e) => update((n) => { n.connections[i].to = e.target.value; })}>{dataset.terminals.map((t) => <option key={t.id}>{t.id}</option>)}</select></td>
      <td><input type="number" value={c.travelTime} style={{ width: 60 }} onChange={(e) => update((n) => { n.connections[i].travelTime = Number(e.target.value); })} /></td>
      <td><input type="number" value={c.capacity} style={{ width: 60 }} onChange={(e) => update((n) => { n.connections[i].capacity = Number(e.target.value); })} /></td>
      <td><button className="danger" onClick={() => update((n) => { n.connections = n.connections.filter((x) => x.id !== c.id); })}>Delete</button></td></tr>)}</tbody></table></div>
      <button onClick={() => update((n) => { const id = `C${n.connections.length + 1}-${Date.now() % 1000}`; n.connections.push({ id, from: n.terminals[0]?.id, to: n.terminals[1]?.id, bidirectional: true, travelTime: 3, capacity: 2 }); })}>+ Add Connection</button></div>

    <div className="card"><h3>Shipment Editor</h3><div className="scroll"><table><thead><tr><th>ID</th><th>Origin</th><th>Dest</th><th>Release</th><th>Deadline</th><th>Priority</th><th>Arrival</th><th></th></tr></thead><tbody>{dataset.shipments.map((s, i) => <tr key={s.id}><td><button className="ghost" onClick={() => setSelected(s.id)}>{s.id}</button></td>
      <td><select value={s.origin} onChange={(e) => update((n) => { n.shipments[i].origin = e.target.value; })}>{dataset.terminals.map((t) => <option key={t.id}>{t.id}</option>)}</select></td>
      <td><select value={s.destination} onChange={(e) => update((n) => { n.shipments[i].destination = e.target.value; })}>{dataset.terminals.map((t) => <option key={t.id}>{t.id}</option>)}</select></td>
      <td><input type="number" value={s.releaseTime} style={{ width: 60 }} onChange={(e) => update((n) => { n.shipments[i].releaseTime = Number(e.target.value); })} /></td>
      <td><input type="number" value={s.deadline} style={{ width: 60 }} onChange={(e) => update((n) => { n.shipments[i].deadline = Number(e.target.value); })} /></td>
      <td><select value={s.priority} onChange={(e) => update((n) => { n.shipments[i].priority = e.target.value; })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></td>
      <td>{resultById.get(s.id)?.arrivalTime ?? '—'}</td>
      <td><button className="danger" onClick={() => update((n) => { n.shipments = n.shipments.filter((x) => x.id !== s.id); })}>Delete</button></td></tr>)}</tbody></table></div>
      <button onClick={() => update((n) => { const id = `S${String(n.shipments.length + 1).padStart(3, '0')}-${Date.now() % 1000}`; n.shipments.push({ id, origin: n.terminals[0]?.id, destination: n.terminals[1]?.id, releaseTime: 0, deadline: 48, priority: 'normal', cargo: 'General', weightTons: 100 }); })}>+ Add Shipment</button></div>

    <div className="card"><h3>Import / Export (JSON schema v1)</h3>
      <div className="row"><button onClick={() => { const blob = new Blob([exportJSON(dataset)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rail-scenario.json'; a.click(); }}>Export JSON file</button>
      <button className="ghost" onClick={() => setImportText(exportJSON(dataset))}>Show export in box</button>
      <input type="file" accept=".json" onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then(doImport); }} /></div>
      <textarea rows="8" style={{ width: '100%', marginTop: 10 }} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a scenario JSON here, then Import…" />
      <button onClick={() => doImport(importText)}>Import from box (validated)</button></div>
  </div>;
}
