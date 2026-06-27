import { ChatPanel } from '@/chat/ChatPanel';
import { Workspace } from '@/workspace/Workspace';
import { useAgentStream } from '@/lib/agent-store';

function App() {
  const { state, send, answerPermission, interrupt } = useAgentStream();

  return (
    <div className="grid h-screen grid-cols-[minmax(380px,460px)_1fr] bg-neutral-950 text-neutral-100">
      <ChatPanel
        state={state}
        send={send}
        answerPermission={answerPermission}
        interrupt={interrupt}
      />
      <Workspace widgets={state.widgets} />
    </div>
  );
}

export default App;
