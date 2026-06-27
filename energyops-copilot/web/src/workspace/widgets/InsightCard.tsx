import { useState } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import type { InsightCardSpec } from '@shared/types';
import { Badge, Button, Card } from '@/components/ui';

const SEVERITY: Record<
  InsightCardSpec['severity'],
  { label: string; variant: 'outline' | 'warning' | 'danger'; bar: string }
> = {
  info: { label: 'Info', variant: 'outline', bar: 'var(--chart-2)' },
  watch: { label: 'Watch', variant: 'warning', bar: 'var(--chart-4)' },
  act: { label: 'Action', variant: 'danger', bar: 'var(--destructive)' }
};

export function InsightCard({
  id,
  spec,
  onAction
}: {
  id: string;
  spec: InsightCardSpec;
  onAction?: (action: 'accept' | 'reject', id: string, title: string) => void;
}) {
  const sev = SEVERITY[spec.severity];
  const [decided, setDecided] = useState<'accept' | 'reject' | null>(null);

  const act = (a: 'accept' | 'reject') => {
    setDecided(a);
    onAction?.(a, id, spec.title);
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex" style={{ borderLeft: `3px solid ${sev.bar}` }}>
        <div className="flex-1 p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <Lightbulb size={15} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {spec.title}
            </span>
            <Badge variant={sev.variant}>{sev.label}</Badge>
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

          {spec.question && (
            <div className="mt-3 rounded-md bg-[var(--secondary)] px-3 py-2 text-[12px] italic text-[var(--muted-foreground)]">
              {spec.question}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {decided ? (
              <Badge variant={decided === 'accept' ? 'success' : 'danger'}>
                {decided === 'accept' ? 'Accepted' : 'Dismissed'}
              </Badge>
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={() => act('accept')}>
                  <Check size={14} /> Accept
                </Button>
                <Button variant="default" size="sm" onClick={() => act('reject')}>
                  <X size={14} /> Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
