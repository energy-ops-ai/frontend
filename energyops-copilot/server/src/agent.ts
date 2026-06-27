// The Claude Agent SDK session. One streaming-input query() for the server's
// lifetime: the browser feeds user messages in, every SDK message is broadcast
// out over the bus. Ported from spike-agent-sdk/ts/server.ts.

import './env.js'; // ensure .env is loaded before the SDK session starts
import {
  query,
  type SDKUserMessage,
  type PermissionResult,
  type PermissionUpdate
} from '@anthropic-ai/claude-agent-sdk';
import { broadcast } from './bus.js';
import { eoTools } from './tools/index.js';

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    'No credentials found. Run `claude setup-token` and put CLAUDE_CODE_OAUTH_TOKEN in server/.env'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// System prompt — structure + goal only. No dataset/scenario specifics ever.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the EnergyOps Copilot, an assistant for operators of complex technical energy systems (campuses, hospitals, district heating, etc.).

Your job is to make a system understandable: combine time-series sensor data, metadata, and topology into a clear picture, surface what is unusual, and turn that into reviewable operational insight. You assemble interactive widgets in the operator's workspace rather than answering only in text.

NEVER assume anything specific about the dataset. Datasets vary widely and can contain multiple concurrent events, missing or stale data, and inconsistent units. Discover everything from the tools; do not rely on prior knowledge of any particular scenario, sensor, branch, or date. Anomalies and their timing are things you find, not things you know.

Workflow:
1. Call describe_dataset first to learn the tables, columns, populated fields, time ranges, and available topology diagrams.
2. Find what is unusual. scan_anomalies ranks where the data is behaving oddly (works even with no expected_value column); scan_data_quality flags gaps and stale/flatlined sensors. Use query_data (read-only SQL) for INSPECTION and AGGREGATION only — stats, rankings, a few sample rows. Do NOT pull long raw series into context with query_data; it wastes context and gets truncated. Use get_topology / get_neighbors to trace flow around what you find.
3. Check get_annotations for operator knowledge about the entities involved, and ground your explanation in it. Always consider whether an apparent anomaly is actually a data-quality issue.
4. Assemble widgets that make it tangible. To plot any sensor series, use render_chart_from_query (give it a SQL query; it runs server-side and the rows never come back to you) — this is the correct way to chart, NOT query_data + render_chart. Use render_chart only for small derived series you already computed. Also: render_topology (highlight what matters), render_state_summary (key values), render_data_quality (trust issues).
5. Close with render_insight_card: the concise conclusion, evidence, recommended check/action, and a "have we seen this before?" question when relevant. This is the payoff — produce one whenever you reach a conclusion the operator should review or act on.
6. When the operator states a durable fact about a component, save it with set_annotation.

Refining widgets: each render tool returns a widget id. When the operator asks to CHANGE a widget already shown (e.g. "highlight the 17th on that chart", "show only the north loop"), re-render with replaceId set to that widget's id so it updates in place instead of creating a duplicate. Use remove_widget to delete a widget, or remove_widget with id "all" to clear the workspace.

Datasets vary: anomaly timing, location, and root cause are things you discover, never assume. Keep prose concise; let the widgets carry the detail. Be explicit about what is measured vs inferred vs missing.`;

// ---------------------------------------------------------------------------
// Streaming input queue: an async iterable the browser pushes messages onto
// ---------------------------------------------------------------------------

function createInputQueue() {
  const items: SDKUserMessage[] = [];
  const waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = [];
  return {
    push(msg: SDKUserMessage) {
      const waiter = waiters.shift();
      if (waiter) waiter({ value: msg, done: false });
      else items.push(msg);
    },
    [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
      return {
        next: () => {
          const value = items.shift();
          return value !== undefined
            ? Promise.resolve({ value, done: false })
            : new Promise(resolve => waiters.push(resolve));
        }
      };
    }
  };
}

const inputQueue = createInputQueue();

// ---------------------------------------------------------------------------
// Permission bridge: canUseTool parks a promise until the browser answers
// ---------------------------------------------------------------------------

type PermissionAnswer =
  | { behavior: 'allow'; always?: boolean; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string };

const pendingPermissions = new Map<
  string,
  { resolve: (answer: PermissionAnswer) => void; suggestions: PermissionUpdate[] }
>();

async function canUseTool(
  toolName: string,
  input: Record<string, unknown>,
  options: { suggestions?: PermissionUpdate[]; toolUseID: string }
): Promise<PermissionResult> {
  // Our own in-process tools are read-only / safe — auto-approve for a smooth
  // demo. Built-in tools (Bash, Write, ...) still go through the UI prompt.
  if (toolName.startsWith('mcp__')) {
    return { behavior: 'allow', updatedInput: input };
  }

  const id = options.toolUseID;
  const suggestions = options.suggestions ?? [];
  const answer = await new Promise<PermissionAnswer>(resolve => {
    pendingPermissions.set(id, { resolve, suggestions });
    broadcast({ kind: 'permission_request', id, toolName, input, suggestions });
  });
  pendingPermissions.delete(id);
  broadcast({ kind: 'permission_resolved', id, behavior: answer.behavior });

  if (answer.behavior === 'allow') {
    return {
      behavior: 'allow',
      updatedInput: answer.updatedInput ?? input,
      updatedPermissions: answer.always ? suggestions : undefined
    };
  }
  return { behavior: 'deny', message: answer.message || 'User denied this action' };
}

export function respondPermission(
  id: string,
  answer: PermissionAnswer
): boolean {
  const pending = pendingPermissions.get(id);
  if (!pending) return false;
  pending.resolve(answer);
  return true;
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

const session = query({
  prompt: inputQueue,
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: SYSTEM_PROMPT
    },
    mcpServers: { eo: eoTools },
    includePartialMessages: true,
    canUseTool
  }
});

(async () => {
  try {
    for await (const message of session) {
      broadcast({ kind: 'sdk', message });
    }
  } catch (err) {
    broadcast({ kind: 'error', error: String(err) });
  }
})();

export function sendMessage(text: string): void {
  inputQueue.push({
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
    session_id: ''
  });
}

export async function interrupt(): Promise<void> {
  await session.interrupt();
}
