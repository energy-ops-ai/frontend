import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Lightbulb,
  Pencil,
  X
} from 'lucide-react';
import type { InsightCardSpec } from '@shared/types';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { ChartWidget } from './ChartWidget';
import {
  postDecision,
  getSimilarDecisions,
  type Decision,
  type DecisionType
} from '@/lib/api';

const SEVERITY: Record<
  InsightCardSpec['severity'],
  { label: string; variant: 'outline' | 'warning' | 'danger'; bar: string }
> = {
  info: { label: 'Info', variant: 'outline', bar: 'var(--chart-2)' },
  watch: { label: 'Watch', variant: 'warning', bar: 'var(--chart-4)' },
  act: { label: 'Action', variant: 'danger', bar: 'var(--destructive)' }
};

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function InsightCard({
  id,
  spec,
  sessionId,
  selected,
  onSelect,
  decided,
  onDecided
}: {
  id: string;
  spec: InsightCardSpec;
  sessionId: string;
  selected?: boolean;
  onSelect?: () => void;
  decided?: Decision;
  onDecided?: () => void;
}) {
  const sev = SEVERITY[spec.severity];
  const [precedent, setPrecedent] = useState<Decision[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [pending, setPending] = useState<null | 'override' | 'dismiss'>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSimilarDecisions(sessionId, spec.relatedNodeIds ?? [], spec.title)
      .then(rows => setPrecedent(rows.filter(d => d.insight_card_id !== id)))
      .catch(() => {});
  }, [sessionId, id, spec.relatedNodeIds, spec.title]);

  const submit = async (type: DecisionType, why?: string) => {
    setBusy(true);
    try {
      await postDecision(sessionId, {
        insightCardId: id,
        insightTitle: spec.title,
        decisionType: type,
        rationale: why,
        relatedNodeIds: spec.relatedNodeIds,
        impact: spec.impact?.value
      });
      onDecided?.();
      setPending(null);
      setRationale('');
    } finally {
      setBusy(false);
    }
  };

  const decidedBadge =
    decided &&
    (decided.decision_type === 'accept'
      ? { label: 'Accepted', variant: 'success' as const }
      : decided.decision_type === 'override'
        ? { label: 'Overridden', variant: 'warning' as const }
        : { label: 'Dismissed', variant: 'outline' as const });

  return (
    <Card
      onClick={onSelect}
      className={`cursor-pointer overflow-hidden p-0 transition ${
        selected ? 'ring-2 ring-[var(--primary)]' : ''
      }`}
    >
      <div className="flex" style={{ borderLeft: `3px solid ${sev.bar}` }}>
        <div className="flex-1 p-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Lightbulb size={15} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {spec.title}
            </span>
            <Badge variant={sev.variant}>{sev.label}</Badge>
            {spec.impact && (
              <Badge variant="outline">
                est. {spec.impact.value.toLocaleString()}
                {spec.impact.unit ? ` ${spec.impact.unit}` : ''}
                {spec.impact.confidence ? ` · ${spec.impact.confidence}` : ''}
              </Badge>
            )}
          </div>

          <p className="text-[13px] leading-relaxed text-[var(--card-foreground)]">
            {spec.summary}
          </p>

          {spec.evidence && spec.evidence.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Evidence
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[var(--muted-foreground)]">
                {spec.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {spec.recommendations && spec.recommendations.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Recommended
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[var(--card-foreground)]">
                {spec.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Embedded curated chart */}
          {spec.chart && (
            <div className="mt-3">
              <button
                type="button"
                onClick={e => {
                  stop(e);
                  setShowChart(s => !s);
                }}
                className="flex items-center gap-1 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {showChart ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showChart ? 'Hide chart' : 'Show chart'}
              </button>
              {showChart && (
                <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-2" onClick={stop}>
                  <ChartWidget spec={spec.chart} height={200} bare />
                </div>
              )}
            </div>
          )}

          {spec.question && (
            <div className="mt-3 rounded-md bg-[var(--secondary)] px-3 py-2 text-[12px] italic text-[var(--muted-foreground)]">
              {spec.question}
            </div>
          )}

          {/* Precedent — "seen before" */}
          {precedent.length > 0 && (
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--secondary)] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                <History size={12} /> Seen before
              </div>
              <ul className="mt-1 space-y-1 text-[12px] text-[var(--card-foreground)]">
                {precedent.map(d => (
                  <li key={d.id}>
                    <span className="font-medium">{d.decision_type}</span> ·{' '}
                    {d.insight_title}
                    {d.rationale ? ` — ${d.rationale}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decision actions */}
          <div className="mt-3" onClick={stop}>
            {decidedBadge ? (
              <div className="flex items-center gap-2">
                <Badge variant={decidedBadge.variant}>{decidedBadge.label}</Badge>
                {decided?.rationale && (
                  <span className="text-[12px] text-[var(--muted-foreground)]">
                    {decided.rationale}
                  </span>
                )}
              </div>
            ) : pending ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  autoFocus
                  rows={2}
                  value={rationale}
                  onChange={e => setRationale(e.target.value)}
                  placeholder={`Why are you ${pending === 'override' ? 'overriding' : 'dismissing'} this? (required)`}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !rationale.trim()}
                    onClick={() => submit(pending, rationale.trim())}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => submit('accept')}>
                  <Check size={14} /> Accept
                </Button>
                <Button size="sm" variant="default" onClick={() => setPending('override')}>
                  <Pencil size={14} /> Override
                </Button>
                <Button size="sm" variant="default" onClick={() => setPending('dismiss')}>
                  <X size={14} /> Dismiss
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
