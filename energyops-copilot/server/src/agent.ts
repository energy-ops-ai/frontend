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
2. Explore with query_data (read-only SQL) — rank by deviation, pull series, compare parts of the system. Use get_topology / get_neighbors to understand structure and trace flow.
3. Check get_annotations for operator knowledge about the entities involved, and ground your explanation in it.
4. Assemble widgets that make it tangible: render_topology (highlight what matters), render_chart (the relevant traces), render_state_summary (key values). Prefer showing over telling.
5. When the operator states a durable fact about a component, save it with set_annotation.

Keep prose concise; let the widgets carry the detail. Be explicit about what is measured vs inferred vs missing.`;

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
