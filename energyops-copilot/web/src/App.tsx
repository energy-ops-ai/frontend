import { useEffect, useState } from 'react';
import { ChatPanel } from '@/chat/ChatPanel';
import { Workspace } from '@/workspace/Workspace';
import { SettingsPage } from '@/settings/SettingsPage';
import { useAgentStream } from '@/lib/agent-store';
import { DEFAULT_THEME, isThemeId, type ThemeId } from '@/lib/themes';

type Page = 'workspace' | 'settings';

function App() {
  const { state, send, answerPermission, interrupt } = useAgentStream();
  const [page, setPage] = useState<Page>('workspace');
  const [theme, setTheme] = useState<ThemeId>(() => {
    const stored = window.localStorage.getItem('energyops-theme');
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('energyops-theme', theme);
  }, [theme]);

  return (
    <div className="grid h-dvh min-h-0 min-w-0 grid-cols-[minmax(380px,460px)_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <ChatPanel
        state={state}
        send={send}
        answerPermission={answerPermission}
        interrupt={interrupt}
      />
      {page === 'settings' ? (
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          onBack={() => setPage('workspace')}
        />
      ) : (
        <Workspace
          widgets={state.widgets}
          onOpenSettings={() => setPage('settings')}
          onInsightAction={(action, _id, title) =>
            send(
              action === 'accept'
                ? `I accept the insight "${title}". Please note this decision and the current system context.`
                : `I'm dismissing the insight "${title}" — it isn't actionable right now.`
            )
          }
        />
      )}
    </div>
  );
}

export default App;
