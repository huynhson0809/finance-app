import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useCustomCategories } from '../hooks/useCustomCategories';
import { useMonthCloudTransactions } from '../hooks/useCloudTransactions';
import { monthOfVietnamDate, nextMonth, prevMonth, todayVietnamDate } from '../lib/date';
import { formatCompactVND, formatVND } from '../lib/money';
import {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
} from '../reports';
import type { CalendarDaySummary } from '../reports';
import { GlassPanel, MetricCard, MoneyRow } from './components/primitives';
import { categoryLabel, getCategoryMeta } from './theme/categoryMeta';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEVEN_COLUMN_GRID = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' };

function safeMonth(value: string | null, today: string): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(today);
}

function displayMonth(monthISO: string): string {
  const [year, month] = monthISO.split('-');
  return `${month}/${year}`;
}

interface CalendarGridProps {
  days: CalendarDaySummary[];
  selectedDate: string;
  today: string;
  weekdays: string[];
  locale: 'en' | 'vi';
  onSelect: (date: string) => void;
  selectDateLabel: (date: string) => string;
}

function CalendarGrid({
  days,
  selectedDate,
  today,
  weekdays,
  locale,
  onSelect,
  selectDateLabel,
}: CalendarGridProps) {
  const leadingBlanks = days.length > 0 ? mondayWeekdayIndex(days[0].date) : 0;
  const cells = [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({ kind: 'blank' as const, id: `blank-${index}` })),
    ...days.map(day => ({ kind: 'day' as const, day })),
  ];

  return (
    <GlassPanel aria-label="Calendar month" className="mx-4 p-3">
      <div
        className="grid text-center text-[11px] font-medium uppercase text-slate-400"
        style={SEVEN_COLUMN_GRID}
      >
        {weekdays.map(day => (
          <div key={day} className="py-2">{day}</div>
        ))}
      </div>
      <div
        className="mt-2 grid gap-1"
        style={SEVEN_COLUMN_GRID}
      >
        {cells.map(cell => {
          if (cell.kind === 'blank') {
            return <div key={cell.id} className="h-[4.65rem] rounded-xl bg-white/[0.03]" />;
          }

          const { day } = cell;
          const isSelected = day.date === selectedDate;
          const isToday = day.date === today;
          return (
            <button
              key={day.date}
              type="button"
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={[
                'flex h-[4.65rem] min-w-0 flex-col rounded-xl border px-1.5 py-1.5 text-left text-xs transition',
                isSelected
                  ? 'border-sky-300/70 bg-sky-400/15 ring-1 ring-inset ring-sky-300/60'
                  : 'border-white/10 bg-white/[0.055]',
                isToday ? 'font-semibold' : '',
              ].join(' ')}
              aria-label={selectDateLabel(day.date)}
              onClick={() => onSelect(day.date)}
            >
              <span className={isToday ? 'text-sky-200' : 'text-slate-200'}>
                {Number(day.date.slice(8, 10))}
              </span>
              <span className="mt-auto flex min-w-0 flex-col gap-0.5">
                {day.incomeTotal > 0 && (
                  <span className="block whitespace-nowrap text-[10px] font-semibold leading-none text-emerald-300">
                    +{formatCompactVND(day.incomeTotal, locale)}
                  </span>
                )}
                {day.expenseTotal > 0 && (
                  <span className="block whitespace-nowrap text-[10px] font-semibold leading-none text-rose-300">
                    -{formatCompactVND(day.expenseTotal, locale)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

interface CalendarMonthViewProps {
  month: string;
  today: string;
  locale: 'en' | 'vi';
}

function CalendarMonthView({ month, today, locale }: CalendarMonthViewProps) {
  const { t } = useTranslation();
  const { data: transactions, loading, error, reload } = useMonthCloudTransactions(month);
  const { categories: customCategories } = useCustomCategories();
  const [manualSelection, setManualSelection] = useState<string | null>(null);

  const daySummaries = useMemo(
    () => calendarDaySummaries(transactions, month),
    [transactions, month],
  );
  const monthTotals = useMemo(
    () => daySummaries.reduce(
      (totals, day) => ({
        expense: totals.expense + day.expenseTotal,
        income: totals.income + day.incomeTotal,
        net: totals.net + day.netTotal,
      }),
      { expense: 0, income: 0, net: 0 },
    ),
    [daySummaries],
  );
  const automaticSelectedDate = useMemo(
    () => initialSelectedDate(month, transactions, today),
    [month, transactions, today],
  );
  const selectedDate = manualSelection ?? automaticSelectedDate;
  const selectedRows = useMemo(
    () => categoryTotalsForDate(transactions, selectedDate),
    [transactions, selectedDate],
  );
  const hasMonthTransactions = daySummaries.some(day => day.hasTransactions);

  function selectDate(date: string) {
    setManualSelection(date);
  }

  function retry() {
    void reload();
  }

  return (
    <>
      {error && (
        <div role="alert" className="mx-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded-xl bg-rose-400 px-3 py-1 font-semibold text-slate-950"
            onClick={retry}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 text-sm text-slate-400" role="status">
          {t('cloud.loading')}
        </div>
      )}

      {!loading && !error && (
        <>
          <CalendarGrid
            days={daySummaries}
            selectedDate={selectedDate}
            today={today}
            weekdays={t('calendar.weekdays', { returnObjects: true }) as string[]}
            locale={locale}
            onSelect={selectDate}
            selectDateLabel={date => t('calendar.selectDate', { date })}
          />

          <section className="grid grid-cols-3 gap-2 px-4 py-4">
            <MetricCard
              label={t('calendar.expense')}
              value={formatVND(monthTotals.expense, locale)}
              tone="expense"
            />
            <MetricCard
              label={t('calendar.income')}
              value={formatVND(monthTotals.income, locale)}
              tone="income"
            />
            <MetricCard
              label={t('calendar.net')}
              value={formatVND(monthTotals.net, locale)}
              tone="neutral"
            />
          </section>

          {!hasMonthTransactions && (
            <div className="px-4 text-sm text-slate-400">{t('calendar.emptyMonth')}</div>
          )}

          <section className="px-4">
            <h2 className="pb-2 text-sm uppercase text-slate-400">
              {t('calendar.selectedDate')}: {selectedDate}
            </h2>
            {selectedRows.length === 0 ? (
              <div className="text-sm text-slate-400">{t('calendar.emptyDay')}</div>
            ) : (
              <ul aria-label={t('calendar.selectedDate')} className="space-y-2">
                {selectedRows.map(row => {
                  const meta = getCategoryMeta(row.category);
                  const Icon = meta.Icon;

                  return (
                    <MoneyRow
                      key={`${row.direction}-${row.category}`}
                      as="li"
                      icon={<Icon aria-hidden="true" className={`h-6 w-6 ${meta.accentClass}`} />}
                      title={categoryLabel(row.category, customCategories, t)}
                      subtitle={t('calendar.transactionCount', { count: row.count })}
                      amount={formatVND(row.direction === 'income' ? row.total : -row.total, locale)}
                      tone={row.direction}
                    />
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function CalendarScreen() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as 'en' | 'vi';
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayVietnamDate();
  const month = safeMonth(searchParams.get('month'), today);

  function step(direction: -1 | 1) {
    const next = direction === -1 ? prevMonth(month) : nextMonth(month);
    setSearchParams({ month: next });
  }

  return (
    <div className="space-y-4 pb-24 pt-4 text-slate-100">
      <header className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-2xl leading-none text-slate-100 shadow-sm"
        >
          ‹
        </button>
        <h1 className="text-xl font-bold text-white">{displayMonth(month)}</h1>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-2xl leading-none text-slate-100 shadow-sm"
        >
          ›
        </button>
      </header>

      <CalendarMonthView key={month} month={month} today={today} locale={locale} />
    </div>
  );
}
