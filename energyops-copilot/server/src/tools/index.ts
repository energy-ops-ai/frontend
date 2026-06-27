// All EnergyOps tools, exposed as one in-process MCP server. Tool names become
// mcp__eo__<name> (e.g. mcp__eo__query_data).

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { dataTools } from './data.js';
import { scanTools } from './scan.js';
import { widgetTools } from './widgets.js';
import { annotationTools } from './annotations.js';

export const eoTools = createSdkMcpServer({
  name: 'eo',
  version: '0.2.0',
  tools: [...dataTools, ...scanTools, ...widgetTools, ...annotationTools]
});
