import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from 'recharts';
import type { ChartSpec } from '@shared/types';
import { Card } from '@/components/ui';

const COLORS = ['#d97757', '#0ea5e9', '#10b981', '#f59e0b', '#a78bfa', '#f472b6'];

const fmtTick = (v: string) => {
  // Shorten ISO timestamps to "MM-DD HH:00"; leave other labels as-is.
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]} ${m[3]}:00` : v;
};

export function ChartWidget({ spec }: { spec: ChartSpec }) {
  const data = useMemo(
    () =>
      spec.x.map((label, i) => {
        const row: Record<string, string | number | null> = { x: label };
        for (const s of spec.series) row[s.name] = s.data[i] ?? null;
        return row;
      }),
    [spec]
  );

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-neutral-200">
        {spec.title}
        {spec.unit ? (
          <span className="ml-2 text-xs font-normal text-neutral-500">
            ({spec.unit})
          </span>
        ) : null}
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tickFormatter={fmtTick}
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              minTickGap={32}
            />
            <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} width={48} />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: 8,
                fontSize: 12
              }}
              labelFormatter={label => fmtTick(String(label))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {spec.markBands?.map((b, i) => (
              <ReferenceArea
                key={i}
                x1={b.from}
                x2={b.to}
                fill="#d97757"
                fillOpacity={0.12}
                label={{ value: b.label, fill: '#d97757', fontSize: 11 }}
              />
            ))}
            {spec.series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                strokeDasharray={s.role === 'expected' ? '5 4' : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
