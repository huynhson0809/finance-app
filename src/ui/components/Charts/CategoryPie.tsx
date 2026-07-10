import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from 'recharts';
import { formatVND } from '../../../lib/money';
import type { Category } from '../../../types';

export interface CategoryDatum {
  category: Category;
  total: number;
  label: string;
  color: string;
}

function truncateLabel(value: string): string {
  return value.length > 18 ? `${value.slice(0, 16)}...` : value;
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

  const total = nonZero.reduce((sum, d) => sum + d.total, 0);
  const selected = nonZero.find(d => d.category === selectedCategory) ?? nonZero[0];
  const selectedPercent = total > 0 ? Math.round((selected.total / total) * 100) : 0;

  return (
    <div
      className="flex h-72 w-full flex-col overflow-hidden"
      aria-label={t('reports.byCategory')}
      role="img"
    >
      <div className="flex h-16 shrink-0 items-start justify-center pt-2">
        <div
          data-testid="category-pie-callout"
          data-placement="above-chart"
          className="pointer-events-none relative min-w-32 rounded-xl border border-white/15 bg-zinc-800 px-4 py-1.5 text-center shadow-xl"
        >
          <div className="text-xs font-semibold text-zinc-200">{truncateLabel(selected.label)}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight text-white">
            {formatVND(selected.total, locale)}
          </div>
          <div className="text-xs font-medium text-zinc-300">{selectedPercent}%</div>
          <span
            data-testid="category-pie-tooltip-arrow"
            className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-zinc-800"
          />
        </div>
      </div>

      <div data-testid="category-pie-plot" className="min-h-0 flex-1">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={nonZero}
              dataKey="total"
              nameKey="label"
              innerRadius="48%"
              outerRadius="78%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={nonZero.length > 1 ? 1.4 : 0}
              stroke="#020617"
              strokeWidth={2}
              onClick={(entry) => {
                const datum = entry as unknown as CategoryDatum;
                setSelectedCategory(datum.category);
              }}
              isAnimationActive={false}
            >
              {nonZero.map(datum => (
                <Cell
                  key={datum.category}
                  fill={datum.color}
                  stroke={datum.category === selected.category ? '#f8fafc' : '#020617'}
                  strokeWidth={datum.category === selected.category ? 3 : 2}
                  className="cursor-pointer"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        {nonZero.map(d => (
          <button
            key={d.category}
            type="button"
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
