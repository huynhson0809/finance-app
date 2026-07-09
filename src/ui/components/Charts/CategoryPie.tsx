import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatVND } from '../../../lib/money';
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
  locale = 'vi',
}: {
  data: CategoryDatum[];
  emptyLabel?: string;
  locale?: 'vi' | 'en';
}) {
  const { t } = useTranslation();
  const nonZero = useMemo(() => data.filter(d => d.total > 0), [data]);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>(
    () => nonZero[0]?.category,
  );

  useEffect(() => {
    if (!nonZero.some(d => d.category === selectedCategory)) {
      setSelectedCategory(nonZero[0]?.category);
    }
  }, [nonZero, selectedCategory]);

  if (nonZero.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-400" role="status">
        {emptyLabel ?? t('reports.noSpending')}
      </div>
    );
  }

  const selected = nonZero.find(d => d.category === selectedCategory) ?? nonZero[0];
  const total = nonZero.reduce((sum, d) => sum + d.total, 0);
  const selectedPercent = total > 0 ? Math.round((selected.total / total) * 100) : 0;

  return (
    <div className="relative h-64 w-full">
      <div
        className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-slate-950/90 px-3 py-2 text-center shadow-lg shadow-black/30"
        data-testid="category-pie-callout"
      >
        <div className="text-xs font-semibold text-white">{selected.label}</div>
        <div className="mt-0.5 text-sm font-bold text-white">{formatVND(selected.total, locale)}</div>
        <div className="text-[11px] text-slate-300">{selectedPercent}%</div>
        <div
          className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-white/10 bg-slate-950/90"
          aria-hidden="true"
        />
      </div>

      <div className="h-full w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={nonZero}
              dataKey="total"
              nameKey="label"
              innerRadius={50}
              outerRadius={90}
            >
              {nonZero.map(d => (
                <Cell
                  key={d.category}
                  fill={d.color}
                  stroke={d.category === selected.category ? '#f8fafc' : 'transparent'}
                  strokeWidth={d.category === selected.category ? 3 : 0}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(d.category)}
                />
              ))}
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

      <div className="absolute bottom-2 left-1/2 z-10 flex max-w-[92%] -translate-x-1/2 gap-1 overflow-x-auto rounded-md bg-slate-950/50 p-1">
        {nonZero.map(d => (
          <button
            key={d.category}
            type="button"
            className={`h-7 shrink-0 rounded px-2 text-xs font-medium transition ${
              d.category === selected.category ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200'
            }`}
            aria-pressed={d.category === selected.category}
            aria-label={`Select ${d.label}`}
            onClick={() => setSelectedCategory(d.category)}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
