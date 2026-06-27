import { useMemo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ChartSpec, ChartType } from '@shared/types';
import { Card } from '@/components/ui';

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#f472b6'
];

const fmtTick = (v: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]} ${m[3]}:00` : v;
};

// Compute a y-axis domain that hugs the data instead of anchoring at 0.
// Padding scales with the data's spread (standard deviation) so flat series
// stay tight and volatile series get more breathing room.
function axisDomain(
  spec: ChartSpec,
  axisId: 'left' | 'right'
): [number, number] | undefined {
  const values: number[] = [];
  for (const s of spec.series) {
    if ((s.axis ?? 'left') !== axisId) continue;
    for (const v of s.data) if (typeof v === 'number' && isFinite(v)) values.push(v);
  }
  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  // Pad by a fraction of the spread; fall back to a sliver when the series is flat.
  const pad = std > 0 ? std * 0.4 : Math.max(Math.abs(max) * 0.02, 1);
  return [min - pad, max + pad];
}

function seriesElement(
  s: ChartSpec['series'][number],
  i: number,
  fallback: ChartType
) {
  const kind = s.kind ?? fallback;
  const color = COLORS[i % COLORS.length];
  const yAxisId = s.axis ?? 'left';
  const common = { key: s.name, dataKey: s.name, name: s.name, yAxisId };
  switch (kind) {
    case 'bar':
      return <Bar {...common} fill={color} radius={[3, 3, 0, 0]} />;
    case 'area':
      return (
        <Area
          {...common}
          type="monotone"
          stroke={color}
          fill={color}
          fillOpacity={0.18}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      );
    case 'scatter':
      return <Scatter {...common} fill={color} />;
    default:
      return (
        <Line
          {...common}
          type="monotone"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={s.role === 'expected' ? '5 4' : undefined}
          dot={false}
          connectNulls
        />
      );
  }
}

export function ChartWidget({
  spec,
  height = 280,
  bare = false
}: {
  spec: ChartSpec;
  height?: number;
  bare?: boolean;
}) {
  const data = useMemo(
    () =>
      spec.x.map((label, i) => {
        const row: Record<string, string | number | null> = { x: label };
        for (const s of spec.series) row[s.name] = s.data[i] ?? null;
        return row;
      }),
    [spec]
  );

  const fallback: ChartType = spec.chartType ?? 'line';
  const hasRight = spec.series.some(s => s.axis === 'right');
  const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 };
  // Bar charts read best from a zero baseline; only tighten line/area/scatter.
  const leftDomain = fallback === 'bar' ? undefined : axisDomain(spec, 'left');
  const rightDomain = fallback === 'bar' ? undefined : axisDomain(spec, 'right');

  const chart = (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tickFormatter={fmtTick}
            tick={axisTick}
            minTickGap={32}
          />
          <YAxis
            yAxisId="left"
            tick={axisTick}
            width={48}
            domain={leftDomain ?? ['auto', 'auto']}
            allowDataOverflow={false}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisTick}
              width={48}
              domain={rightDomain ?? ['auto', 'auto']}
              allowDataOverflow={false}
            />
          )}
          <Tooltip
            contentStyle={{
              background: 'var(--panel-strong)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12
            }}
            labelFormatter={label => fmtTick(String(label))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {spec.markBands?.map((b, i) => (
            <ReferenceArea
              key={`mb${i}`}
              x1={b.from}
              x2={b.to}
              yAxisId="left"
              fill="var(--accent)"
              fillOpacity={0.12}
              label={{ value: b.label, fill: 'var(--accent)', fontSize: 11 }}
            />
          ))}
          {spec.referenceLines?.map((r, i) => (
            <ReferenceLine
              key={`rl${i}`}
              y={r.value}
              yAxisId={r.axis ?? 'left'}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: r.label, fill: 'var(--muted-foreground)', fontSize: 10 }}
            />
          ))}
          {spec.series.map((s, i) => seriesElement(s, i, fallback))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  if (bare) {
    return (
      <div>
        <div className="mb-1 text-[12px] font-medium text-[var(--foreground)]">
          {spec.title}
          {spec.unit ? (
            <span className="ml-2 font-normal text-[var(--muted-foreground)]">
              ({spec.unit})
            </span>
          ) : null}
        </div>
        {chart}
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-[var(--foreground)]">
        {spec.title}
        {spec.unit ? (
          <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
            ({spec.unit})
          </span>
        ) : null}
      </div>
      {chart}
    </Card>
  );
}
