import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export interface DailyDatum { date: string; total: number; }

export function MonthBar({ data }: { data: DailyDatum[] }) {
  const ticks = data.filter((_, i) => i % 5 === 0).map(d => d.date.slice(-2));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis
            dataKey={d => d.date.slice(-2)}
            ticks={ticks}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '14px',
              color: '#f8fafc',
            }}
          />
          <Bar dataKey="total" fill="#38bdf8" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
