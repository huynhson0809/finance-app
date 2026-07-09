import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PeriodDatum {
  label: string;
  total: number;
}

export function PeriodBar({
  data,
  color = '#38bdf8',
}: {
  data: PeriodDatum[];
  color?: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#cbd5e1', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.18)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.16)' }}
          />
          <YAxis
            hide
            domain={[0, (max: number) => Math.max(max, 1)]}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
            contentStyle={{
              background: '#111827',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '12px',
              color: '#f8fafc',
            }}
          />
          <Bar dataKey="total" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
