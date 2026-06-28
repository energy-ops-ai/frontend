// Builds a tool-native dataset folder from the "track1" warehouse-staffing
// dataset (Helios Logistics — DC Rhein-Main) so the EnergyOps Copilot can
// analyze it with all existing features (describe / query / scan_anomalies /
// scan_data_quality / topology / insight cards / operator annotations).
//
// It reads the already-clean long-format CSVs plus cost_model.json and
// decision_log.json and emits the same shape as datasets/cooling-sample:
//   sensors.csv, sensor_data_hourly.csv, sensor_attributes.csv,
//   sensor_external_refs.csv, cost_model.csv, manifest.json,
//   diagrams/warehouse_flow.json (+ _graph.txt), annotations.json, README.md
//
// "Sensors" here are daily metrics: realized operative need vs. plan, volume
// drivers (forecast = expected_value, realized = value), and the per-activity
// staffing plan. The anomaly scan then surfaces the days/activities where the
// plan diverged most from reality — exactly the staffing question this dataset
// poses.
//
// Usage:
//   node scripts/build-helios-staffing-dataset.mjs [track1Dir] [outDir]
// Defaults:
//   track1Dir = ../track1Dataset (repo-root sibling)
//   outDir    = datasets/helios-staffing

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const trackDir = path.resolve(
  process.argv[2] ?? path.resolve(REPO, '../track1Dataset')
);
const outDir = path.resolve(process.argv[3] ?? path.join(REPO, 'datasets/helios-staffing'));

if (!existsSync(trackDir)) {
  console.error(`track1 dataset not found: ${trackDir}`);
  process.exit(1);
}

// --- tiny CSV helpers (clean long files are comma-sep, dot decimals, ISO dates)
function readCsv(file) {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}
const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers, rows) =>
  [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join(
    '\n'
  ) + '\n';

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n, d = 2) =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d;
const iso = d => `${d}T00:00:00Z`;

// --- inputs ----------------------------------------------------------------
const present = readCsv(path.join(trackDir, 'clean/present_long.csv'));
const volumes = readCsv(path.join(trackDir, 'clean/volumes_long.csv'));
const recs = readCsv(path.join(trackDir, 'clean/recommendations_long.csv'));
const costModel = JSON.parse(
  readFileSync(path.join(trackDir, 'cost_model.json'), 'utf8')
);
const decisionLog = JSON.parse(
  readFileSync(path.join(trackDir, 'decision_log.json'), 'utf8')
);

const dates = present.map(r => r.date).sort();
const startDate = dates[0];
const endDate = dates[dates.length - 1];

// --- standing plan per (date, activity) ------------------------------------
// Each weekly run re-plans. The "plan that was in force" on a given day is the
// row whose planned_week_start covers that date, breaking ties by the latest
// decision_date <= date. Collapse to one value per (date, activity).
const planByDateActivity = new Map(); // `${date}|${activity}` -> {value, group}
for (const r of recs) {
  const key = `${r.date}|${r.activity}`;
  const prev = planByDateActivity.get(key);
  const dd = r.decision_date;
  if (!prev || dd > prev.decision_date) {
    planByDateActivity.set(key, {
      decision_date: dd,
      value: num(r.recommended_person_days),
      group: r.group
    });
  }
}

// distinct activities, preserving first-seen order, split by group
const activities = [];
const seenAct = new Set();
for (const r of recs) {
  if (!seenAct.has(r.activity)) {
    seenAct.add(r.activity);
    activities.push({ activity: r.activity, group: r.group });
  }
}
const operativeActs = activities.filter(a => a.group === 'operative');
const adminActs = activities.filter(a => a.group === 'admin');

// planned operative total per date (the optimiser's recommended head count)
const plannedOperativeByDate = new Map();
for (const d of dates) {
  let sum = 0;
  for (const a of operativeActs) {
    const p = planByDateActivity.get(`${d}|${a.activity}`);
    if (p?.value != null) sum += p.value;
  }
  plannedOperativeByDate.set(d, round(sum, 2));
}

// --- sensor catalog --------------------------------------------------------
// id ranges: 95000x summary/drivers, 9511xx operative activity plans,
// 9512xx admin activity plans.
const sensors = [];
const slug = s =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const SUMMARY = {
  need: {
    id: 950001,
    node: 'operative_need',
    name: 'Operative staffing need (realized)',
    unit: 'person-days',
    branch: 'demand',
    role: 'demand',
    desc: 'Realized operative person-days (= total on-site minus the constant 8 admin desks). Scoring target. expected_value is the optimiser-planned operative total.'
  },
  total: {
    id: 950002,
    node: 'total_staffing',
    name: 'Total on-site staffing',
    unit: 'person-days',
    branch: 'demand',
    role: 'demand',
    desc: 'Realized total on-site person-days (operative + 8 admin). expected_value is the planned total (planned operative + 8).'
  },
  picks: {
    id: 950010,
    node: 'picks_volume',
    name: 'Picks volume',
    unit: 'picks',
    branch: 'driver',
    role: 'driver',
    desc: 'Outbound pick lines. value = realized, expected_value = forecast.'
  },
  outbound: {
    id: 950011,
    node: 'outbound_volume',
    name: 'Outbound pallets volume',
    unit: 'pallets',
    branch: 'driver',
    role: 'driver',
    desc: 'Outbound full pallets. value = realized, expected_value = forecast.'
  },
  inbound: {
    id: 950012,
    node: 'inbound_volume',
    name: 'Inbound pallets volume',
    unit: 'pallets',
    branch: 'driver',
    role: 'driver',
    desc: 'Inbound pallets received. value = realized, expected_value = forecast.'
  }
};

for (const s of Object.values(SUMMARY)) {
  sensors.push({
    sensor_id: s.id,
    name: s.name,
    unit: s.unit,
    cumulative: 'False',
    energy_type: '',
    role: s.role,
    branch: s.branch,
    description: s.desc,
    node: s.node,
    activity: null,
    group: s.branch === 'driver' ? 'driver' : 'demand'
  });
}

// activity plan sensors
const activitySensor = new Map(); // activity -> sensor record
operativeActs.forEach((a, i) => {
  const rec = {
    sensor_id: 951000 + (i + 1),
    name: `${a.activity} — planned`,
    unit: 'person-days',
    cumulative: 'False',
    energy_type: '',
    role: 'plan',
    branch: 'operative',
    description: `Optimiser-recommended person-days for ${a.activity} (the standing weekly plan).`,
    node: slug(a.activity),
    activity: a.activity,
    group: 'operative'
  };
  sensors.push(rec);
  activitySensor.set(a.activity, rec);
});
adminActs.forEach((a, i) => {
  const rec = {
    sensor_id: 952000 + (i + 1),
    name: `${a.activity} — planned`,
    unit: 'person-days',
    cumulative: 'False',
    energy_type: '',
    role: 'plan',
    branch: 'admin',
    description: `Planned person-days for ${a.activity} (admin desk; constant, excluded from scoring).`,
    node: slug(a.activity),
    activity: a.activity,
    group: 'admin'
  };
  sensors.push(rec);
  activitySensor.set(a.activity, rec);
});

// --- time series (sensor_data_hourly.csv; daily granularity) ---------------
const dataRows = [];
const presentByDate = new Map(present.map(r => [r.date, r]));
const volumesByDate = new Map(volumes.map(r => [r.date, r]));

function pushSeries(sensorId, getVal, getExp) {
  for (const d of dates) {
    const value = getVal(d);
    if (value == null) continue;
    const expected = getExp ? getExp(d) : null;
    const deviation =
      expected != null && expected !== 0
        ? round(((value - expected) / expected) * 100, 2)
        : null;
    dataRows.push({
      sensor_id: sensorId,
      timestamp: iso(d),
      value: round(value, 3),
      expected_value: expected == null ? '' : round(expected, 3),
      deviation_pct: deviation == null ? '' : deviation,
      sample_count: 1,
      scenario_event: ''
    });
  }
}

pushSeries(
  SUMMARY.need.id,
  d => num(presentByDate.get(d)?.present_operative_person_days),
  d => plannedOperativeByDate.get(d)
);
pushSeries(
  SUMMARY.total.id,
  d => num(presentByDate.get(d)?.present_total_person_days),
  d => {
    const p = plannedOperativeByDate.get(d);
    return p == null ? null : round(p + 8, 2);
  }
);
pushSeries(
  SUMMARY.picks.id,
  d => num(volumesByDate.get(d)?.picks_realized),
  d => num(volumesByDate.get(d)?.picks_forecast)
);
pushSeries(
  SUMMARY.outbound.id,
  d => num(volumesByDate.get(d)?.outbound_realized),
  d => num(volumesByDate.get(d)?.outbound_forecast)
);
pushSeries(
  SUMMARY.inbound.id,
  d => num(volumesByDate.get(d)?.inbound_realized),
  d => num(volumesByDate.get(d)?.inbound_forecast)
);
for (const [activity, rec] of activitySensor) {
  pushSeries(rec.sensor_id, d => planByDateActivity.get(`${d}|${activity}`)?.value ?? null);
}

// --- sensor_attributes.csv -------------------------------------------------
const attrRows = [];
for (const s of sensors) {
  attrRows.push({ sensor_id: s.sensor_id, attribute: 'group', value: s.group });
  attrRows.push({ sensor_id: s.sensor_id, attribute: 'unit', value: s.unit });
  if (s.activity)
    attrRows.push({ sensor_id: s.sensor_id, attribute: 'activity', value: s.activity });
  attrRows.push({ sensor_id: s.sensor_id, attribute: 'role', value: s.role });
}

// --- sensor_external_refs.csv ----------------------------------------------
const refRows = sensors.map(s => ({
  sensor_id: s.sensor_id,
  source: 'helios-track1',
  external_id: `HELIOS-${s.sensor_id}`,
  external_key: s.node,
  label: s.name
}));

// --- cost_model.csv (queryable scoring params) -----------------------------
const costRows = [
  ['currency', costModel.currency],
  ['regular_cost_per_person_day', costModel.regular_cost_per_person_day],
  ['overstaffing_idle_cost_per_person_day', costModel.overstaffing?.idle_cost_per_person_day],
  ['understaffing_overtime_premium_pct', costModel.understaffing?.overtime_premium_pct],
  ['understaffing_sla_tolerance_person_days', costModel.understaffing?.sla_tolerance_person_days],
  ['understaffing_sla_penalty_per_person_day', costModel.understaffing?.sla_penalty_per_person_day],
  ['admin_person_days_per_day', 8]
].map(([param, value]) => ({ param, value }));

// --- topology diagram ------------------------------------------------------
// Warehouse process flow, laid out left (inbound) -> right (outbound), with an
// admin row beneath. Node ids = sensor node slugs so insight cards can link.
const nodeBySlug = new Map(sensors.map(s => [s.node, s]));
const COL = 260;
const ROW = 180;
const colX = c => 60 + c * COL;
const rowY = r => 60 + r * ROW;

// stage -> ordered activity slugs (drivers/summary interleaved)
const columns = [
  ['inbound_volume'],
  ['unloading', 'yard_shunting', 'transit_drivers'],
  ['receiving', 'returns_qc'],
  ['putaway', 'vna_replenishment'],
  ['replenishment_relocation', 'aisle_maintenance', 'picks_volume'],
  ['picking', 'pick_qa'],
  ['co_packing_line', 'staging'],
  ['loading', 'team_leads'],
  ['outbound_volume', 'operative_need', 'total_staffing']
];
const adminColumns = [
  [],
  ['inbound_office'],
  [],
  ['inventory'],
  ['control_room'],
  [],
  [],
  ['outbound_office'],
  []
];

const positions = new Map();
columns.forEach((slugs, c) => {
  slugs.forEach((sl, r) => positions.set(sl, { x: colX(c), y: rowY(r) }));
});
const adminBaseRow = 4;
adminColumns.forEach((slugs, c) => {
  slugs.forEach((sl, r) => positions.set(sl, { x: colX(c), y: rowY(adminBaseRow + r) }));
});

const nodes = sensors
  .filter(s => positions.has(s.node))
  .map(s => ({
    id: s.node,
    type: 'meterNode',
    position: positions.get(s.node),
    data: {
      label: s.name,
      sensor_id: s.sensor_id,
      unit: s.unit,
      energy_type: null,
      role: s.role,
      branch: s.branch
    }
  }));

const edgeDefs = [
  ['inbound_volume', 'unloading'],
  ['unloading', 'receiving'],
  ['yard_shunting', 'unloading'],
  ['receiving', 'putaway'],
  ['returns_qc', 'putaway'],
  ['putaway', 'vna_replenishment'],
  ['vna_replenishment', 'picking'],
  ['replenishment_relocation', 'picking'],
  ['aisle_maintenance', 'picking'],
  ['picks_volume', 'picking'],
  ['picking', 'pick_qa'],
  ['pick_qa', 'staging'],
  ['co_packing_line', 'staging'],
  ['staging', 'loading'],
  ['transit_drivers', 'staging'],
  ['loading', 'outbound_volume'],
  ['loading', 'operative_need'],
  ['picking', 'operative_need'],
  ['team_leads', 'operative_need'],
  ['operative_need', 'total_staffing'],
  ['inbound_office', 'receiving'],
  ['outbound_office', 'loading'],
  ['inventory', 'putaway'],
  ['control_room', 'total_staffing']
].filter(([s, t]) => nodeBySlug.has(s) && nodeBySlug.has(t));

const edges = edgeDefs.map(([s, t], i) => ({
  id: `edge-${i + 1}`,
  source: s,
  target: t,
  data: {
    source_label: nodeBySlug.get(s).name,
    target_label: nodeBySlug.get(t).name
  }
}));

const diagram = {
  id: 'warehouse_flow',
  name: 'Warehouse process flow',
  type: 'energy_topology',
  nodes,
  edges
};
const graphTxt =
  `# ${diagram.name}\n\nTopology edges:\n` +
  edges.map(e => `- ${e.data.source_label} -> ${e.data.target_label}`).join('\n') +
  '\n';

// --- annotations.json (seeded operator knowledge from the decision log) -----
// The decision log holds multiple notes per activity over time; the tool keeps
// one annotation per entity, so notes for the same target are concatenated
// chronologically with provenance. Global ("operative") notes attach to the
// realized-need sensor (950001).
const scopeToActivities = {
  transit: ['Transit drivers'],
  co_packing: ['Co-Packing line'],
  picking: ['Picking'],
  receiving: ['Receiving'],
  loading: ['Loading'],
  putaway: ['Putaway'],
  staging: ['Staging'],
  vna_replen: ['VNA replenishment']
};
function resolveTargets(scope) {
  const scopes = Array.isArray(scope) ? scope : [scope];
  const targets = new Set();
  for (const s of scopes) {
    if (s === 'operative' || s === 'all') {
      targets.add(SUMMARY.need.id);
      continue;
    }
    const acts = scopeToActivities[s];
    if (acts) for (const a of acts) targets.add(activitySensor.get(a)?.sensor_id);
  }
  return [...targets].filter(Boolean);
}

const notesByTarget = new Map(); // sensorId -> {lines[], latest}
for (const e of decisionLog.entries) {
  const line = `[${e.id} · ${e.author} · ${e.captured_on}] ${e.note}`;
  for (const sid of resolveTargets(e.scope)) {
    const cur = notesByTarget.get(sid) ?? { lines: [], latest: e.captured_on };
    cur.lines.push(line);
    if (e.captured_on > cur.latest) cur.latest = e.captured_on;
    notesByTarget.set(sid, cur);
  }
}
const annotations = [...notesByTarget.entries()].map(([sid, v]) => ({
  target_kind: 'sensor',
  target_id: String(sid),
  text: v.lines.join('\n'),
  updated_at: `${v.latest}T00:00:00Z`
}));

// --- manifest --------------------------------------------------------------
const manifest = {
  created_at_utc: new Date().toISOString(),
  source: 'helios-track1-staffing',
  scenario: 'helios_staffing_rhein_main',
  start_date: startDate,
  time_window: { start: startDate, end: endDate },
  site: decisionLog.site,
  unit: decisionLog.unit,
  narrative:
    'Daily warehouse staffing at Helios Logistics — DC Rhein-Main. Each weekday has a realized operative staffing need and an optimiser-recommended plan per activity. The question is where the plan over- or under-staffed reality: overstaffing wastes full wage, understaffing is cheap until it crosses the SLA tolerance and then penalties explode (see cost_model). Volume drivers (picks, inbound/outbound pallets) carry forecast vs. realized. The decision log holds messy, unverified planner notes about which activities behave unlike the optimiser assumes.',
  cost_model: costModel,
  counts: {
    sensors: sensors.length,
    diagrams: 1,
    hourly_sensor_rows: dataRows.length,
    sensor_attributes: attrRows.length,
    sensor_external_refs: refRows.length,
    annotations: annotations.length
  },
  files: {
    readme: 'README.md',
    diagrams: 'diagrams/',
    sensors: 'sensors.csv',
    sensor_attributes: 'sensor_attributes.csv',
    sensor_external_refs: 'sensor_external_refs.csv',
    sensor_data_hourly: 'sensor_data_hourly.csv',
    cost_model: 'cost_model.csv',
    annotations: 'annotations.json'
  }
};

const readme = `# Helios Logistics — DC Rhein-Main (staffing)

Generated from the track1 warehouse-staffing dataset for the EnergyOps Copilot.
Adapted to the sensor-timeseries shape so all tool features apply: each "sensor"
is a daily metric.

## Series (sensor_data_hourly.csv — daily)
- **950001 Operative staffing need (realized)** — value = realized operative
  person-days, expected_value = optimiser-planned operative total. The plan
  error (deviation_pct) is the core anomaly signal.
- **950002 Total on-site staffing** — includes the constant 8 admin desks.
- **950010/11/12 Volume drivers** — picks / outbound / inbound pallets,
  value = realized, expected_value = forecast.
- **9511xx / 9512xx** — per-activity planned person-days (operative / admin).

## Scoring (cost_model.csv / manifest.cost_model)
Excess cost vs. a perfect plan: overstaffing ${costModel.overstaffing.idle_cost_per_person_day} EUR/surplus
person-day; understaffing the ${costModel.understaffing.overtime_premium_pct}% overtime premium PLUS
${costModel.understaffing.sla_penalty_per_person_day} EUR/person-day beyond a ${costModel.understaffing.sla_tolerance_person_days}
tolerance. A small deliberate undershoot beats a safe overshoot — until the tolerance.

## Operator knowledge (annotations.json)
Seeded from the planners' decision log. **Deliberately messy and unverified** —
some notes are durable, some superstition, some stale, some contradictory.
Treat them as claims, not facts.
`;

// --- write -----------------------------------------------------------------
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, 'diagrams'), { recursive: true });

writeFileSync(
  path.join(outDir, 'sensors.csv'),
  toCsv(
    ['sensor_id', 'name', 'unit', 'cumulative', 'energy_type', 'role', 'branch', 'description'],
    sensors
  )
);
writeFileSync(
  path.join(outDir, 'sensor_data_hourly.csv'),
  toCsv(
    ['sensor_id', 'timestamp', 'value', 'expected_value', 'deviation_pct', 'sample_count', 'scenario_event'],
    dataRows
  )
);
writeFileSync(
  path.join(outDir, 'sensor_attributes.csv'),
  toCsv(['sensor_id', 'attribute', 'value'], attrRows)
);
writeFileSync(
  path.join(outDir, 'sensor_external_refs.csv'),
  toCsv(['sensor_id', 'source', 'external_id', 'external_key', 'label'], refRows)
);
writeFileSync(path.join(outDir, 'cost_model.csv'), toCsv(['param', 'value'], costRows));
writeFileSync(
  path.join(outDir, 'diagrams/warehouse_flow.json'),
  JSON.stringify(diagram, null, 2)
);
writeFileSync(path.join(outDir, 'diagrams/warehouse_flow_graph.txt'), graphTxt);
writeFileSync(path.join(outDir, 'annotations.json'), JSON.stringify(annotations, null, 2));
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(outDir, 'README.md'), readme);

console.log(`Built ${outDir}`);
console.log(
  `  sensors=${sensors.length} series_rows=${dataRows.length} attrs=${attrRows.length} ` +
    `nodes=${nodes.length} edges=${edges.length} annotations=${annotations.length}`
);
console.log(`  date range ${startDate} -> ${endDate} (${dates.length} days)`);
