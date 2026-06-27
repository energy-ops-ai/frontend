// Shared protocol between server and web. The web app imports these types so the
// widget contract stays in one place. Keep this file dependency-free (types only).

// ---------------------------------------------------------------------------
// Widgets — the structured views the agent assembles in the workspace
// ---------------------------------------------------------------------------

export type NodeStatus =
  | 'ok'
  | 'warn'
  | 'alert'
  | 'stale'
  | 'inferred'
  | 'missing';

export interface TopologySpec {
  title: string;
  nodes: {
    id: string;
    label: string;
    sensorId?: number;
    role?: string;
    branch?: string;
    group?: string;
    status?: NodeStatus;
    value?: number;
    unit?: string;
    annotation?: string; // operator-added description, shown + editable on the node
    position?: { x: number; y: number }; // curated layout; web auto-lays-out if absent
  }[];
  edges: {
    source: string;
    target: string;
    label?: string;
    emphasis?: boolean;
  }[];
  highlight?: string[]; // node ids to spotlight
  collapsedGroups?: string[]; // group keys rendered as one node (simplification)
}

export interface ChartSpec {
  title: string;
  x: string[]; // ISO timestamps
  series: {
    name: string;
    data: (number | null)[];
    role?: 'actual' | 'expected' | 'deviation';
  }[];
  unit?: string;
  markBands?: { from: string; to: string; label?: string }[];
}

export interface StateSummarySpec {
  title: string;
  items: {
    label: string;
    value: string | number;
    unit?: string;
    status?: NodeStatus;
    delta?: number;
  }[];
}

export interface DataQualitySpec {
  title: string;
  issues: {
    sensor: string;
    type: 'gap' | 'stale' | 'unit_mismatch' | 'inconsistent';
    severity: 'low' | 'med' | 'high';
    detail: string;
  }[];
}

export interface InsightCardSpec {
  title: string;
  severity: 'info' | 'watch' | 'act';
  summary: string;
  evidence?: string[];
  recommendations?: string[];
  question?: string;
  relatedDecisions?: { id: string; summary: string }[];
}

export type Widget =
  | { id: string; type: 'topology'; spec: TopologySpec }
  | { id: string; type: 'chart'; spec: ChartSpec }
  | { id: string; type: 'state_summary'; spec: StateSummarySpec }
  | { id: string; type: 'data_quality'; spec: DataQualitySpec }
  | { id: string; type: 'insight_card'; spec: InsightCardSpec };

export type WidgetType = Widget['type'];

// ---------------------------------------------------------------------------
// Server -> browser events (sent over SSE)
// ---------------------------------------------------------------------------

export interface PermissionRequest {
  kind: 'permission_request';
  id: string;
  toolName: string;
  input: unknown;
  suggestions: unknown[];
}

export type ServerEvent =
  | { kind: 'sdk'; message: unknown }
  | { kind: 'widget'; widget: Widget }
  | { kind: 'widget_update'; id: string; patch: Partial<Widget> }
  | { kind: 'widget_remove'; id: string } // id === 'all' clears the workspace
  | PermissionRequest
  | { kind: 'permission_resolved'; id: string; behavior: 'allow' | 'deny' }
  | { kind: 'error'; error: string };
