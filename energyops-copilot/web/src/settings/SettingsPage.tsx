import { ArrowLeft, Check, MonitorCog } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { THEMES, type ThemeId } from '@/lib/themes';

interface Props {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onBack: () => void;
}

export function SettingsPage({ theme, onThemeChange, onBack }: Props) {
  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to workspace">
          <ArrowLeft />
        </Button>
        <MonitorCog size={15} className="text-[var(--muted-foreground)]" />
        <span className="text-sm font-medium text-[var(--foreground)]">Settings</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <section className="max-w-4xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Appearance</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Choose the console theme used across chat, widgets, and charts.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {THEMES.map(option => {
              const selected = option.id === theme;
              return (
                <Card
                  key={option.id}
                  className={
                    selected
                      ? 'border-[var(--primary)] bg-[var(--card)]'
                      : 'bg-[var(--card)]'
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>{option.name}</CardTitle>
                      {selected ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 flex gap-2">
                      {option.swatches.map(color => (
                        <span
                          key={color}
                          className="h-7 w-12 rounded-md border border-[var(--border)]"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <p className="min-h-10 text-sm text-[var(--muted-foreground)]">
                      {option.description}
                    </p>
                    <Button
                      className="mt-4"
                      variant={selected ? 'primary' : 'default'}
                      onClick={() => onThemeChange(option.id)}
                    >
                      {selected ? 'Selected' : 'Use theme'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
