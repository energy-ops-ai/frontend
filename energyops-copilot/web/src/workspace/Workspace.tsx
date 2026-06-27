import { LayoutDashboard, Settings } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { TopologyWidget } from './widgets/TopologyWidget';
import { ChartWidget } from './widgets/ChartWidget';
import type {
  NodeStatus,
  StateSummarySpec,
  Widget
} from '@shared/types';

const STATUS_COLOR: Record<NodeStatus, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  alert: 'text-red-400',
  stale: 'text-[var(--muted-foreground)]',
  inferred: 'text-sky-400',
  missing: 'text-fuchsia-400'
};

function StateSummaryWidget({ spec }: { spec: StateSummarySpec }) {
  return (
    <Card className="p-4">
      <div className="mb-3 text-sm font-semibold text-[var(--foreground)]">
        {spec.title}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {spec.items.map((it, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {it.label}
            </div>
            <div
              className={`mt-1 text-lg font-semibold ${
                it.status ? STATUS_COLOR[it.status] : 'text-[var(--foreground)]'
              }`}
            >
              {it.value}
              {it.unit ? (
                <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                  {it.unit}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WidgetView({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'state_summary':
      return <StateSummaryWidget spec={widget.spec} />;
    case 'topology':
      return <TopologyWidget spec={widget.spec} />;
    case 'chart':
      return <ChartWidget spec={widget.spec} />;
    default:
      return (
        <Card className="p-4">
          <div className="text-sm font-semibold text-[var(--foreground)]">
            {widget.type} widget
          </div>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-[var(--background)] p-2 text-[12px] text-[var(--muted-foreground)]">
            {JSON.stringify(widget.spec, null, 2)}
          </pre>
        </Card>
      );
  }
}

export function Workspace({
  widgets,
  onOpenSettings
}: {
  widgets: Widget[];
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <LayoutDashboard size={15} className="text-[var(--muted-foreground)]" />
        <span className="text-[14px] font-medium text-[var(--foreground)]">
          Workspace
        </span>
        <span className="text-[12px] text-[var(--muted-foreground)]">
          {widgets.length} widget{widgets.length === 1 ? '' : 's'}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings />
        </Button>
      </header>

      {widgets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
          Widgets the copilot assembles - topology, charts, insights - appear
          here.
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {widgets.map(w => (
            <WidgetView key={w.id} widget={w} />
          ))}
        </div>
      )}
    </div>
  );
}
