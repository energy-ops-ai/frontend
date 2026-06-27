import { AnimatePresence, motion } from 'framer-motion';
import { ChatPanel } from '@/chat/ChatPanel';
import { Workspace } from '@/workspace/Workspace';
import { AnalyzingOverlay } from '@/components/AnalyzingOverlay';
import { useAgentStream } from '@/lib/agent-store';

export function SessionPage({
  sessionId,
  onBack,
  onOpenSettings
}: {
  sessionId: string;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const { state, send, answerPermission, interrupt } = useAgentStream(sessionId);

  // First turn = the initial analysis: show the analyzing overlay until it lands.
  const analyzing =
    state.completedTurns === 0 && (state.working || state.widgets.length === 0);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[image:var(--workspace-background)] text-[var(--foreground)]">
      <motion.div
        className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(380px,460px)_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden"
        initial={false}
        animate={{
          opacity: analyzing ? 0 : 1,
          scale: analyzing ? 0.985 : 1,
          filter: analyzing ? 'blur(6px)' : 'blur(0px)'
        }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <ChatPanel
          state={state}
          send={send}
          answerPermission={answerPermission}
          interrupt={interrupt}
          onBack={onBack}
        />
        <Workspace
          widgets={state.widgets}
          sessionId={sessionId}
          onOpenSettings={onOpenSettings}
        />
      </motion.div>

      <AnimatePresence>
        {analyzing && (
          <AnalyzingOverlay
            key="overlay"
            state={state}
            answerPermission={answerPermission}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
