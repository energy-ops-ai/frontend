// Reduces the server's SSE event stream into UI state: a chat feed, a live
// streaming bubble, the workspace widgets, and a status line. Mirrors the
// rendering logic from the spike's index.html, restructured as a reducer.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ServerEvent, Widget } from '@shared/types';
import { getSessionSnapshot, postProviderCredentials } from '@/lib/api';

export type FeedItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: unknown;
      status: 'running' | 'done' | 'error';
      result?: string;
    }
  | {
      kind: 'permission';
      id: string;
      toolName: string;
      input: unknown;
      status: 'waiting' | 'allowed' | 'denied';
    }
  | { kind: 'meta'; id: string; text: string };

export interface AgentState {
  feed: FeedItem[];
  streaming: string | null;
  widgets: Widget[];
  status: string;
  working: boolean;
  completedTurns: number; // increments on each agent `result` (turn finished)
}

const initialState: AgentState = {
  feed: [],
  streaming: null,
  widgets: [],
  status: 'connecting…',
  working: false,
  completedTurns: 0
};

let seq = 0;
const uid = () => `f${++seq}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceSdk(state: AgentState, m: any): AgentState {
  switch (m?.type) {
    case 'system':
      if (m.subtype === 'init') {
        return {
          ...state,
          status: 'ready',
          working: false,
          feed: [
            ...state.feed,
            { kind: 'meta', id: uid(), text: `session · ${m.model}` }
          ]
        };
      }
      return state;

    case 'stream_event': {
      const ev = m.event;
      if (
        ev?.type === 'content_block_delta' &&
        ev.delta?.type === 'text_delta'
      ) {
        return {
          ...state,
          working: true,
          status: 'working…',
          streaming: (state.streaming ?? '') + ev.delta.text
        };
      }
      return { ...state, working: true, status: 'working…' };
    }

    case 'assistant': {
      let feed = state.feed;
      for (const block of m.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          feed = [...feed, { kind: 'assistant', id: uid(), text: block.text }];
        } else if (block.type === 'thinking' && block.thinking) {
          feed = [
            ...feed,
            { kind: 'thinking', id: uid(), text: block.thinking }
          ];
        } else if (block.type === 'tool_use') {
          // Upsert by tool id: re-applying the same event (e.g. a history
          // replay) must not append a duplicate-keyed feed item.
          if (feed.some(f => f.kind === 'tool' && f.id === block.id)) continue;
          feed = [
            ...feed,
            {
              kind: 'tool',
              id: block.id,
              name: block.name,
              input: block.input,
              status: 'running'
            }
          ];
        }
      }
      return { ...state, feed, streaming: null };
    }

    case 'user': {
      const content = m.message?.content;
      if (!Array.isArray(content)) return state;
      let feed = state.feed;
      for (const block of content) {
        if (block.type !== 'tool_result') continue;
        const text =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .filter((c: any) => c.type === 'text')
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((c: any) => c.text)
                  .join('\n')
              : '';
        feed = feed.map(f =>
          f.kind === 'tool' && f.id === block.tool_use_id
            ? { ...f, status: block.is_error ? 'error' : 'done', result: text }
            : f
        );
      }
      return { ...state, feed };
    }

    case 'result': {
      const dur = m.duration_ms ? ` · ${(m.duration_ms / 1000).toFixed(1)}s` : '';
      const cost = m.total_cost_usd ? ` · $${m.total_cost_usd.toFixed(4)}` : '';
      return {
        ...state,
        streaming: null,
        working: false,
        completedTurns: state.completedTurns + 1,
        status: `ready${dur}${cost}`
      };
    }
  }
  return state;
}

function reduceEvent(state: AgentState, event: ServerEvent): AgentState {
  switch (event.kind) {
    case 'sdk':
      return reduceSdk(state, event.message);
    case 'agent': {
      const ev = event.event;
      switch (ev.type) {
        case 'user_message': {
          const last = state.feed[state.feed.length - 1];
          if (state.working && last?.kind === 'user' && last.text === ev.text) {
            return state;
          }
          return {
            ...state,
            feed: [...state.feed, { kind: 'user', id: uid(), text: ev.text }]
          };
        }
        case 'meta':
          return {
            ...state,
            status: 'ready',
            feed: [
              ...state.feed,
              {
                kind: 'meta',
                id: uid(),
                text: `${ev.provider} session${ev.model ? ` · ${ev.model}` : ''}`
              }
            ]
          };
        case 'assistant_delta':
          return {
            ...state,
            working: true,
            status: 'working...',
            streaming: (state.streaming ?? '') + ev.text
          };
        case 'assistant_message':
          return {
            ...state,
            streaming: null,
            feed: ev.text.trim()
              ? [...state.feed, { kind: 'assistant', id: uid(), text: ev.text }]
              : state.feed
          };
        case 'tool_start':
          return {
            ...state,
            working: true,
            status: 'working...',
            streaming: null,
            // Upsert by id so a replayed event can't append a duplicate.
            feed: state.feed.some(f => f.kind === 'tool' && f.id === ev.id)
              ? state.feed
              : [
                  ...state.feed,
                  {
                    kind: 'tool',
                    id: ev.id,
                    name: ev.name,
                    input: ev.input,
                    status: 'running'
                  }
                ]
          };
        case 'tool_result':
          return {
            ...state,
            feed: state.feed.map(f =>
              f.kind === 'tool' && f.id === ev.id
                ? {
                    ...f,
                    status: ev.isError ? 'error' : 'done',
                    result: ev.result
                  }
                : f
            )
          };
        case 'turn_complete': {
          const dur = ev.duration_ms ? ` · ${(ev.duration_ms / 1000).toFixed(1)}s` : '';
          const cost = ev.total_cost_usd ? ` · $${ev.total_cost_usd.toFixed(4)}` : '';
          return {
            ...state,
            streaming: null,
            working: false,
            completedTurns: state.completedTurns + 1,
            status: `ready${dur}${cost}`
          };
        }
      }
      return state;
    }
    case 'widget': {
      // Upsert: reusing an id replaces the widget in place (refinement);
      // a new id appends.
      const exists = state.widgets.some(w => w.id === event.widget.id);
      return {
        ...state,
        widgets: exists
          ? state.widgets.map(w =>
              w.id === event.widget.id ? event.widget : w
            )
          : [...state.widgets, event.widget]
      };
    }
    case 'widget_update':
      return {
        ...state,
        widgets: state.widgets.map(w =>
          w.id === event.id ? ({ ...w, ...event.patch } as Widget) : w
        )
      };
    case 'widget_remove':
      return {
        ...state,
        widgets:
          event.id === 'all'
            ? []
            : state.widgets.filter(w => w.id !== event.id)
      };
    case 'permission_request':
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: 'permission',
            id: event.id,
            toolName: event.toolName,
            input: event.input,
            status: 'waiting'
          }
        ]
      };
    case 'permission_resolved':
      return {
        ...state,
        feed: state.feed.map(f =>
          f.kind === 'permission' && f.id === event.id
            ? { ...f, status: event.behavior === 'allow' ? 'allowed' : 'denied' }
            : f
        )
      };
    case 'credential_needed':
      return {
        ...state,
        working: false,
        feed: [...state.feed, { kind: 'meta', id: uid(), text: event.message }]
      };
    case 'error':
      return {
        ...state,
        working: false,
        feed: [...state.feed, { kind: 'meta', id: uid(), text: `⚠ ${event.error}` }]
      };
  }
  return state;
}

type Action =
  | { type: 'event'; event: ServerEvent }
  | { type: 'snapshot'; events: ServerEvent[] }
  | { type: 'user'; text: string }
  | { type: 'send_error' }
  | { type: 'status'; text: string }
  | { type: 'reset' };

function reducer(state: AgentState, action: Action): AgentState {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'snapshot': {
      const restored = action.events.reduce(reduceEvent, state);
      return {
        ...restored,
        working: false,
        status: restored.status.startsWith('connecting') ? 'ready' : restored.status
      };
    }
    case 'event':
      return reduceEvent(state, action.event);
    case 'user':
      return {
        ...state,
        working: true,
        status: 'working…',
        feed: [...state.feed, { kind: 'user', id: uid(), text: action.text }]
      };
    case 'send_error':
      return {
        ...state,
        working: false,
        status: 'message failed'
      };
    case 'status':
      return { ...state, status: action.text };
  }
}

export interface PermissionAnswer {
  behavior: 'allow' | 'deny';
  message?: string;
  always?: boolean;
  updatedInput?: Record<string, unknown>;
}

export function useAgentStream(
  sessionId: string,
  options: {
    claudeApiKey?: string;
    claudeModel?: string;
    openRouterApiKey?: string;
    azureEndpoint?: string;
    azureApiKey?: string;
    azureModel?: string;
  } = {}
) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);

  const openStream = useCallback(() => {
    if (esRef.current) return;
    // The SSE endpoint replays the FULL history on connect and then streams
    // live events, so it is the single source of truth. Reset first so the
    // replay rebuilds state from scratch instead of stacking on top of an
    // already-hydrated snapshot — which doubled tool cards (duplicate React
    // keys) and desynced widgets (the topology "disappearing").
    dispatch({ type: 'reset' });
    const es = new EventSource(`/sessions/${sessionId}/events`);
    esRef.current = es;
    es.onopen = () => dispatch({ type: 'status', text: 'ready' });
    es.onmessage = e => {
      if (!e.data) return;
      dispatch({ type: 'event', event: JSON.parse(e.data) as ServerEvent });
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
      dispatch({ type: 'status', text: 'stream disconnected' });
    };
  }, [sessionId]);

  useEffect(() => {
    dispatch({ type: 'reset' });
    esRef.current?.close();
    esRef.current = null;
    let cancelled = false;

    void getSessionSnapshot(sessionId)
      .then(snapshot => {
        if (cancelled) return;
        // Live session: the stream replays history + live (single source of
        // truth). Idle session: seed from the snapshot and don't hold a stream.
        if (snapshot.live) openStream();
        else dispatch({ type: 'snapshot', events: snapshot.events });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'status', text: 'session not found' });
        }
      });

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [sessionId, openStream]);

  useEffect(() => {
    if (options.claudeApiKey || options.openRouterApiKey || options.azureApiKey) {
      void postProviderCredentials(sessionId, {
        claudeApiKey: options.claudeApiKey,
        claudeModel: options.claudeModel,
        openRouterApiKey: options.openRouterApiKey,
        azureEndpoint: options.azureEndpoint,
        azureApiKey: options.azureApiKey,
        azureModel: options.azureModel
      });
    }
  }, [
    sessionId,
    options.claudeApiKey,
    options.claudeModel,
    options.openRouterApiKey,
    options.azureEndpoint,
    options.azureApiKey,
    options.azureModel
  ]);

  const send = useCallback(
    async (text: string, openRouterApiKey = options.openRouterApiKey) => {
      dispatch({ type: 'user', text });
      try {
        const res = await fetch(`/sessions/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            claudeApiKey: options.claudeApiKey,
            claudeModel: options.claudeModel,
            openRouterApiKey,
            azureEndpoint: options.azureEndpoint,
            azureApiKey: options.azureApiKey,
            azureModel: options.azureModel
          })
        });
        if (!res.ok) throw new Error(`Message failed (${res.status})`);
        openStream();
      } catch {
        dispatch({ type: 'send_error' });
      }
    },
    [
      sessionId,
      options.claudeApiKey,
      options.claudeModel,
      options.openRouterApiKey,
      options.azureEndpoint,
      options.azureApiKey,
      options.azureModel,
      openStream
    ]
  );

  const answerPermission = useCallback(
    async (id: string, answer: PermissionAnswer) => {
      await fetch(`/sessions/${sessionId}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...answer })
      });
    },
    [sessionId]
  );

  const interrupt = useCallback(() => {
    void fetch(`/sessions/${sessionId}/interrupt`, { method: 'POST' });
  }, [sessionId]);

  return { state, send, answerPermission, interrupt };
}
