// All EnergyOps tools, exposed as one in-process MCP server. Tool names become
// mcp__eo__<name> (e.g. mcp__eo__query_data).

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { dataTools } from './data.js';
import { widgetTools } from './widgets.js';
import { annotationTools } from './annotations.js';

export const eoTools = createSdkMcpServer({
  name: 'eo',
  version: '0.1.0',
  tools: [...dataTools, ...widgetTools, ...annotationTools]
});
