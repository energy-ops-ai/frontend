import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, X } from 'lucide-react';
import { AskQuestionCard } from '@/chat/ChatPanel';
import type { AgentState, FeedItem, PermissionAnswer } from '@/lib/agent-store';
import { labelFor } from '@/lib/tool-labels';

function ChipInner({ item }: { item: Extract<FeedItem, { kind: 'tool' }> }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] text-[var(--card-foreground)] shadow-sm">
      {item.status === 'running' ? (
        <Loader2 size={13} className="animate-spin text-[var(--primary)]" />
      ) : item.status === 'error' ? (
        <X size={13} className="text-[var(--destructive)]" />
      ) : (
        <Check size={13} className="text-emerald-400" />
      )}
      {labelFor(item.name)}
    </div>
  );
}

export function AnalyzingOverlay({
  state,
  answerPermission
}: {
  state: AgentState;
  answerPermission: (id: string, answer: PermissionAnswer) => void;
}) {
  const toolItems = state.feed.filter(
    (f): f is Extract<FeedItem, { kind: 'tool' }> => f.kind === 'tool'
  );
  const recentTools = toolItems.slice(-4);
  const runningTool = [...toolItems].reverse().find(t => t.status === 'running');
  const phase = runningTool
    ? labelFor(runningTool.name)
    : state.working
      ? 'Analyzing system'
      : 'Restoring session';

  const lastAssistant = [...state.feed]
    .reverse()
    .find((f): f is Extract<FeedItem, { kind: 'assistant' }> => f.kind === 'assistant');
  const thought = state.streaming ?? lastAssistant?.text ?? null;
  const thoughtKey = state.streaming ? 'streaming' : (lastAssistant?.id ?? 'none');

  const pendingQuestion = state.feed.find(
    (f): f is Extract<FeedItem, { kind: 'permission' }> =>
      f.kind === 'permission' &&
      f.status === 'waiting' &&
      f.toolName === 'AskUserQuestion'
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 80, transition: { duration: 0.28, ease: 'easeIn' } }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[var(--background)] px-6"
    >
      <AnimatePresence mode="wait">
        {pendingQuestion ? (
          <motion.div
            key="question"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-[640px]"
          >
            <AskQuestionCard item={pendingQuestion} answerPermission={answerPermission} />
          </motion.div>
        ) : (
          <motion.div
            key="working"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={34} className="animate-spin text-[var(--primary)]" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="text-lg font-semibold text-[var(--foreground)]"
                >
                  {phase}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex min-h-[1.5rem] items-center justify-center">
              <AnimatePresence mode="wait">
                {thought && (
                  <motion.div
                    key={thoughtKey}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-[560px] text-center text-[14px] italic leading-relaxed text-[var(--muted-foreground)]"
                  >
                    {thought.length > 240 ? `${thought.slice(0, 240)}…` : thought}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex max-w-[680px] flex-wrap items-center justify-center gap-2">
              <AnimatePresence>
                {recentTools.map(t => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChipInner item={t} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
