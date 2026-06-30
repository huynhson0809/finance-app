import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export interface DailyDatum { date: string; total: number; }

export function MonthBar({ data }: { data: DailyDatum[] }) {
  const ticks = data.filter((_, i) => i % 5 === 0).map(d => d.date.slice(-2));
  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey={d => d.date.slice(-2)} ticks={ticks} />
          <YAxis hide />
          <Tooltip />
          <Bar dataKey="total" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
