// Hono HTTP + SSE server. Exposes the agent loop to the React app:
//   GET  /events      Server-Sent Events stream (replays history, then live)
//   POST /message     { text }                          -> queue a user message
//   POST /permission  { id, behavior, ... }             -> answer a tool prompt
//   POST /interrupt                                      -> interrupt the agent
//   GET  /health
import './env.js'; // load .env before anything reads env vars
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { getHistory, subscribe } from './bus.js';
import { sendMessage, respondPermission, interrupt } from './agent.js';

const PORT = Number(process.env.PORT ?? 3460);

const app = new Hono();
app.use('*', cors()); // Vite dev server runs on a different origin

app.get('/health', c => c.json({ ok: true }));

app.get('/events', c =>
  streamSSE(c, async stream => {
    // Replay everything so far so a (re)connecting browser is in sync.
    for (const event of getHistory()) {
      await stream.writeSSE({ data: JSON.stringify(event) });
    }

    // Serialize live writes through a promise chain so events keep their order
    // without blocking the broadcaster.
    let chain: Promise<unknown> = Promise.resolve();
    const unsubscribe = subscribe(event => {
      chain = chain.then(() =>
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {})
      );
    });

    const heartbeat = setInterval(() => {
      chain = chain.then(() => stream.writeSSE({ data: '', event: 'ping' }).catch(() => {}));
    }, 25000);

    await new Promise<void>(resolve => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
        resolve();
      });
    });
  })
);

app.post('/message', async c => {
  const { text } = await c.req.json<{ text?: string }>();
  if (typeof text === 'string' && text.trim()) sendMessage(text);
  return c.json({ ok: true });
});

app.post('/permission', async c => {
  const { id, behavior, message, always, updatedInput } = await c.req.json();
  const ok = respondPermission(
    id,
    behavior === 'allow'
      ? { behavior, always, updatedInput }
      : { behavior, message }
  );
  return c.json({ ok }, ok ? 200 : 404);
});

app.post('/interrupt', async c => {
  await interrupt();
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: PORT }, info => {
  console.log(`EnergyOps Copilot server on http://localhost:${info.port}`);
});
