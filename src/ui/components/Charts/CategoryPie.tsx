import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../../types';

export interface CategoryDatum {
  category: Category;
  total: number;
  label: string;
  color: string;
}

export function CategoryPie({
  data,
  emptyLabel,
}: {
  data: CategoryDatum[];
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const nonZero = data.filter(d => d.total > 0);
  if (nonZero.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-400" role="status">
        {emptyLabel ?? t('reports.noSpending')}
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={nonZero} dataKey="total" nameKey="label" innerRadius={50} outerRadius={90}>
            {nonZero.map(d => <Cell key={d.category} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '14px',
              color: '#f8fafc',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
