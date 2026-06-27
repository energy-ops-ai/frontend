import { AlertTriangle } from 'lucide-react';
import type { DataQualitySpec } from '@shared/types';
import { Badge, Card } from '@/components/ui';

const SEV_VARIANT: Record<
  DataQualitySpec['issues'][number]['severity'],
  'outline' | 'warning' | 'danger'
> = {
  low: 'outline',
  med: 'warning',
  high: 'danger'
};

const TYPE_LABEL: Record<DataQualitySpec['issues'][number]['type'], string> = {
  gap: 'Gap',
  stale: 'Stale',
  unit_mismatch: 'Unit',
  inconsistent: 'Inconsistent'
};

export function DataQualityWidget({ spec }: { spec: DataQualitySpec }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <AlertTriangle size={15} className="text-[var(--chart-4)]" />
        {spec.title}
        <span className="text-[12px] font-normal text-[var(--muted-foreground)]">
          {spec.issues.length} issue{spec.issues.length === 1 ? '' : 's'}
        </span>
      </div>

      {spec.issues.length === 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12px] text-[var(--muted-foreground)]">
          No data-quality issues found in this scope.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {spec.issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5"
            >
              <Badge variant={SEV_VARIANT[issue.severity]}>
                {TYPE_LABEL[issue.type]}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--card-foreground)]">
                  {issue.sensor}
                </div>
                <div className="text-[12px] text-[var(--muted-foreground)]">
                  {issue.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
