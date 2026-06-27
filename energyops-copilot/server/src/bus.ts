// Tiny event bus. Every server event is stored (so a reconnecting browser can
// replay the session) and pushed live to all connected SSE subscribers.

import type { ServerEvent } from './types.js';

type Listener = (event: ServerEvent) => void;

const history: ServerEvent[] = [];
const listeners = new Set<Listener>();

export function broadcast(event: ServerEvent): void {
  history.push(event);
  for (const listener of listeners) listener(event);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHistory(): readonly ServerEvent[] {
  return history;
}
