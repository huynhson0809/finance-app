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

interface Point {
  x: number;
  y: number;
}

const CENTER = { x: 160, y: 136 };
const INNER_RADIUS = 54;
const OUTER_RADIUS = 88;
const ACTIVE_OUTER_RADIUS = 94;
const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 256;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function polarToCartesian(center: Point, radius: number, angleDegrees: number): Point {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180;
  return {
    x: center.x + radius * Math.cos(angleRadians),
    y: center.y + radius * Math.sin(angleRadians),
  };
}

function donutPath(startAngle: number, endAngle: number, outerRadius: number): string {
  const safeEndAngle = endAngle - startAngle >= 360 ? startAngle + 359.99 : endAngle;
  const outerStart = polarToCartesian(CENTER, outerRadius, startAngle);
  const outerEnd = polarToCartesian(CENTER, outerRadius, safeEndAngle);
  const innerEnd = polarToCartesian(CENTER, INNER_RADIUS, safeEndAngle);
  const innerStart = polarToCartesian(CENTER, INNER_RADIUS, startAngle);
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
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
  let cursor = 0;
  const segments = nonZero.map(datum => {
    const startAngle = cursor;
    const endAngle = cursor + (datum.total / total) * 360;
    cursor = endAngle;
    return { datum, startAngle, endAngle, midAngle: (startAngle + endAngle) / 2 };
  });
  const selectedSegment = segments.find(segment => segment.datum.category === selected.category) ?? segments[0];
  const edge = polarToCartesian(CENTER, ACTIVE_OUTER_RADIUS + 4, selectedSegment.midAngle);
  const stem = polarToCartesian(CENTER, ACTIVE_OUTER_RADIUS + 24, selectedSegment.midAngle);
  const boxWidth = 136;
  const boxHeight = 66;
  const boxX = clamp(stem.x - boxWidth / 2, 8, VIEWBOX_WIDTH - boxWidth - 8);
  const boxY = clamp(stem.y - boxHeight - 12, 8, VIEWBOX_HEIGHT - boxHeight - 8);
  const boxCenterX = boxX + boxWidth / 2;
  const boxBaseY = boxY + boxHeight;
  const tipX = clamp(stem.x, boxX + 12, boxX + boxWidth - 12);
  const tipY = Math.min(stem.y - 1, boxBaseY + 15);

  return (
    <div className="relative h-72 w-full overflow-hidden">
      <svg
        aria-label={t('reports.byCategory')}
        className="h-full w-full"
        role="img"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <g>
          {segments.map(segment => {
            const active = segment.datum.category === selected.category;
            return (
              <path
                key={segment.datum.category}
                d={donutPath(segment.startAngle, segment.endAngle, active ? ACTIVE_OUTER_RADIUS : OUTER_RADIUS)}
                fill={segment.datum.color}
                stroke={active ? '#f8fafc' : '#020617'}
                strokeWidth={active ? 3 : 2}
                className="cursor-pointer transition"
                onClick={() => setSelectedCategory(segment.datum.category)}
              />
            );
          })}
        </g>
        <path
          data-testid="category-pie-leader"
          d={`M ${edge.x} ${edge.y} L ${stem.x} ${stem.y}`}
          stroke="#4b5563"
          strokeWidth={1.5}
          fill="none"
        />
        <g data-testid="category-pie-callout">
          <path
            d={`M ${tipX - 8} ${boxBaseY - 1} L ${tipX} ${tipY} L ${tipX + 8} ${boxBaseY - 1} Z`}
            fill="#303236"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
          <rect
            x={boxX}
            y={boxY}
            width={boxWidth}
            height={boxHeight}
            rx={9}
            fill="#303236"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
          <text x={boxCenterX} y={boxY + 19} textAnchor="middle" fill="#d1d5db" fontSize={12} fontWeight={600}>
            {truncateLabel(selected.label)}
          </text>
          <text x={boxCenterX} y={boxY + 42} textAnchor="middle" fill="#ffffff" fontSize={20} fontWeight={800}>
            {formatVND(selected.total, locale)}
          </text>
          <text x={boxCenterX} y={boxY + 58} textAnchor="middle" fill="#d1d5db" fontSize={12}>
            {selectedPercent}%
          </text>
        </g>
      </svg>

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
