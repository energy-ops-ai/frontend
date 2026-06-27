// Human-friendly names for the agent's tools, shared by the chat feed and the
// analyzing overlay so both read the same way.

export const TOOL_LABELS: Record<string, string> = {
  mcp__eo__describe_dataset: 'Reading the dataset',
  mcp__eo__query_data: 'Querying the data',
  mcp__eo__scan_anomalies: 'Scanning for anomalies',
  mcp__eo__scan_data_quality: 'Checking data quality',
  mcp__eo__get_topology: 'Mapping the topology',
  mcp__eo__get_neighbors: 'Tracing the flow',
  mcp__eo__get_annotations: 'Recalling operator notes',
  mcp__eo__render_topology: 'Drawing the system',
  mcp__eo__render_chart: 'Plotting a chart',
  mcp__eo__render_chart_from_query: 'Plotting a chart',
  mcp__eo__render_state_summary: 'Summarising state',
  mcp__eo__render_data_quality: 'Flagging data issues',
  mcp__eo__render_insight_card: 'Forming an insight',
  mcp__eo__set_annotation: 'Saving a note'
};

/** A readable label for a tool, falling back to a de-prefixed, spaced name. */
export const labelFor = (name: string): string =>
  TOOL_LABELS[name] ?? name.replace(/^mcp__eo__/, '').replace(/_/g, ' ');
