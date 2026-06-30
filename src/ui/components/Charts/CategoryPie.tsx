import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';

export interface CategoryDatum {
  category: string;
  total: number;
  label: string;
  color: string;
}

export function CategoryPie({ data }: { data: CategoryDatum[] }) {
  const { t } = useTranslation();
  const nonZero = data.filter(d => d.total > 0);
  if (nonZero.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-500" role="status">
        {t('reports.noSpending')}
      </div>
    );
  }
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width={320} height={256}>
        <PieChart>
          <Pie data={nonZero} dataKey="total" nameKey="label" innerRadius={50} outerRadius={90}>
            {nonZero.map(d => <Cell key={d.category} fill={d.color} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
