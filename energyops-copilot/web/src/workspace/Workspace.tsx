import { LayoutDashboard } from 'lucide-react';
import { Card } from '@/components/ui';
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
  stale: 'text-neutral-500',
  inferred: 'text-sky-400',
  missing: 'text-fuchsia-400'
};

function StateSummaryWidget({ spec }: { spec: StateSummarySpec }) {
  return (
    <Card className="p-4">
      <div className="mb-3 text-sm font-semibold text-neutral-200">
        {spec.title}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {spec.items.map((it, i) => (
          <div
            key={i}
            className="rounded-lg border border-neutral-700/60 bg-neutral-900/50 p-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              {it.label}
            </div>
            <div
              className={`mt-1 text-lg font-semibold ${
                it.status ? STATUS_COLOR[it.status] : 'text-neutral-100'
              }`}
            >
              {it.value}
              {it.unit ? (
                <span className="ml-1 text-xs text-neutral-500">{it.unit}</span>
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
      // P2 adds data_quality / insight_card renderers.
      return (
        <Card className="p-4">
          <div className="text-sm font-semibold text-neutral-200">
            {widget.type} widget
          </div>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-neutral-900/70 p-2 text-[12px] text-neutral-400">
            {JSON.stringify(widget.spec, null, 2)}
          </pre>
        </Card>
      );
  }
}

export function Workspace({ widgets }: { widgets: Widget[] }) {
  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2.5">
        <LayoutDashboard size={15} className="text-neutral-400" />
        <span className="text-[14px] font-medium text-neutral-300">
          Workspace
        </span>
        <span className="text-[12px] text-neutral-600">
          {widgets.length} widget{widgets.length === 1 ? '' : 's'}
        </span>
      </header>

      {widgets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-neutral-600">
          Widgets the copilot assembles — topology, charts, insights — appear
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
