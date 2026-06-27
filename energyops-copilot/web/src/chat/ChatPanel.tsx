import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Brain,
  ChevronRight,
  FileInput,
  FileText,
  ShieldCheck,
  Wrench
} from 'lucide-react';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import type {
  AgentState,
  FeedItem,
  PermissionAnswer
} from '@/lib/agent-store';

interface Props {
  state: AgentState;
  send: (text: string) => void;
  answerPermission: (id: string, answer: PermissionAnswer) => void;
  interrupt: () => void;
}

const pretty = (v: unknown) => {
  const s = JSON.stringify(v, null, 2);
  return s && s.length > 1200 ? `${s.slice(0, 1200)}\n...` : s;
};

const inputDescription = (input: unknown) => {
  if (!input || typeof input !== 'object') return null;
  const description = (input as { description?: unknown }).description;
  return typeof description === 'string' && description.trim()
    ? description.trim()
    : null;
};

function DetailBlock({
  label,
  open,
  children
}: {
  label: string;
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)]">
      <div className="px-2 py-1.5 text-[12px] text-[var(--muted-foreground)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function DetailIconButton({
  active,
  label,
  onClick,
  children
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex size-7 items-center justify-center rounded-md border transition ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
          : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      }`}
    >
      {children}
    </button>
  );
}

function ToolCard({ item }: { item: Extract<FeedItem, { kind: 'tool' }> }) {
  const [expanded, setExpanded] = useState<'input' | 'result' | null>(null);
  const badgeVariant =
    item.status === 'running'
      ? 'default'
      : item.status === 'error'
        ? 'danger'
        : 'success';
  const description = inputDescription(item.input);

  return (
    <Card className="max-w-[680px] p-3 text-[13px]">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
          <Wrench size={14} className="text-[var(--accent)]" />
          <span className="font-mono">{item.name}</span>
          <Badge variant={badgeVariant}>{item.status}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DetailIconButton
            active={expanded === 'input'}
            label="Show input"
            onClick={() =>
              setExpanded(expanded === 'input' ? null : 'input')
            }
          >
            <FileInput size={14} />
          </DetailIconButton>
          {item.result && (
            <DetailIconButton
              active={expanded === 'result'}
              label="Show result"
              onClick={() =>
                setExpanded(expanded === 'result' ? null : 'result')
              }
            >
              <FileText size={14} />
            </DetailIconButton>
          )}
        </div>
      </div>
      {description && (
        <div className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
          {description}
        </div>
      )}
      <DetailBlock label="Input" open={expanded === 'input'}>
        <pre className="max-h-48 overflow-auto border-t border-[var(--border)] p-2 text-[12px] text-[var(--muted-foreground)]">
          {pretty(item.input)}
        </pre>
      </DetailBlock>
      {item.result && (
        <DetailBlock label="Result" open={expanded === 'result'}>
          <pre className="max-h-48 overflow-auto border-t border-[var(--border)] p-2 text-[12px] text-[var(--muted-foreground)]">
            {item.result.length > 1500
              ? `${item.result.slice(0, 1500)}\n...`
              : item.result}
          </pre>
        </DetailBlock>
      )}
    </Card>
  );
}

function PermissionCard({
  item,
  answerPermission
}: {
  item: Extract<FeedItem, { kind: 'permission' }>;
  answerPermission: Props['answerPermission'];
}) {
  const [expanded, setExpanded] = useState(false);
  const description = inputDescription(item.input);

  return (
    <Card className="max-w-[680px] border-[var(--accent)] p-3 text-[13px]">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
          <ShieldCheck size={14} className="text-[var(--accent)]" />
          Permission: <span className="font-mono">{item.toolName}</span>
          <Badge>{item.status}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DetailIconButton
            active={expanded}
            label="Show request details"
            onClick={() => setExpanded(!expanded)}
          >
            <FileInput size={14} />
          </DetailIconButton>
        </div>
      </div>
      {description && (
        <div className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
          {description}
        </div>
      )}
      <DetailBlock label="Request details" open={expanded}>
        <pre className="max-h-48 overflow-auto border-t border-[var(--border)] p-2 text-[12px] text-[var(--muted-foreground)]">
          {pretty(item.input)}
        </pre>
      </DetailBlock>
      {item.status === 'waiting' && (
        <div className="mt-2.5 flex gap-2">
          <Button
            variant="primary"
            onClick={() => answerPermission(item.id, { behavior: 'allow' })}
          >
            Allow
          </Button>
          <Button
            variant="danger"
            onClick={() => answerPermission(item.id, { behavior: 'deny' })}
          >
            Deny
          </Button>
        </div>
      )}
    </Card>
  );
}

function Item({
  item,
  answerPermission
}: {
  item: FeedItem;
  answerPermission: Props['answerPermission'];
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="max-w-[680px] self-end whitespace-pre-wrap rounded-xl bg-[var(--primary)] px-3.5 py-2.5 text-[14px] text-[var(--primary-foreground)]">
          {item.text}
        </div>
      );
    case 'assistant':
      return (
        <div className="max-w-[680px] self-start whitespace-pre-wrap rounded-xl bg-[var(--secondary)] px-3.5 py-2.5 text-[14px] text-[var(--secondary-foreground)]">
          {item.text}
        </div>
      );
    case 'thinking':
      return (
        <Card className="max-w-[680px] p-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-[var(--muted-foreground)]">
            <Brain size={14} /> Thinking
          </div>
          <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-[var(--muted-foreground)]">
            {item.text.slice(0, 800)}
          </pre>
        </Card>
      );
    case 'tool':
      return <ToolCard item={item} />;
    case 'permission':
      return (
        <PermissionCard item={item} answerPermission={answerPermission} />
      );
    case 'meta':
      return (
        <div className="self-center text-[12px] text-[var(--muted-foreground)]">
          {item.text}
        </div>
      );
  }
}

export function ChatPanel({ state, send, answerPermission, interrupt }: Props) {
  const [input, setInput] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const scrollToBottom = () => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (shouldStickToBottomRef.current) scrollToBottom();
  }, [state.feed, state.streaming]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    shouldStickToBottomRef.current = true;
    setInput('');
    send(text);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <h1 className="text-[15px] font-semibold text-[var(--foreground)]">
          EnergyOps Copilot
        </h1>
        <span
          className={
            state.working
              ? 'text-[12px] text-[var(--accent)]'
              : 'text-[12px] text-[var(--muted-foreground)]'
          }
        >
          {state.status}
        </span>
        <span className="flex-1" />
        <Button variant="danger" onClick={interrupt}>
          Stop
        </Button>
      </header>

      <div
        ref={feedRef}
        onScroll={e => {
          const el = e.currentTarget;
          const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          shouldStickToBottomRef.current = distanceFromBottom < 48;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-4"
      >
        {state.feed.map(item => (
          <Item key={item.id} item={item} answerPermission={answerPermission} />
        ))}
        {state.streaming && (
          <div className="max-w-[680px] self-start whitespace-pre-wrap rounded-xl bg-[var(--secondary)] px-3.5 py-2.5 text-[14px] text-[var(--muted-foreground)] opacity-80">
            {state.streaming}
          </div>
        )}
      </div>

      <footer className="flex gap-2 border-t border-[var(--border)] p-3">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Ask about the system... (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none"
        />
        <Button variant="primary" onClick={submit} className="self-stretch px-4">
          Send <ChevronRight size={16} />
        </Button>
      </footer>
    </div>
  );
}
