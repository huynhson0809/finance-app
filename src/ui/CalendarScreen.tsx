import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMonthCloudTransactions } from '../hooks/useCloudTransactions';
import { monthOfVietnamDate, nextMonth, prevMonth, todayVietnamDate } from '../lib/date';
import { formatVND } from '../lib/money';
import {
  calendarDaySummaries,
  categoryTotalsForDate,
  initialSelectedDate,
  mondayWeekdayIndex,
} from '../reports';
import type { CalendarCategoryDayTotal, CalendarDaySummary } from '../reports';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEVEN_COLUMN_GRID = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' };

function safeMonth(value: string | null, today: string): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(today);
}

function displayMonth(monthISO: string): string {
  const [year, month] = monthISO.split('-');
  return `${month}/${year}`;
}

function directionColor(direction: CalendarCategoryDayTotal['direction']): string {
  return direction === 'income' ? 'text-emerald-700' : 'text-red-600';
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
    <section className="px-4">
      <div
        className="grid rounded-t-lg border border-b-0 bg-gray-50 text-center text-[11px] font-medium uppercase text-gray-500"
        style={SEVEN_COLUMN_GRID}
      >
        {weekdays.map(day => (
          <div key={day} className="py-2">{day}</div>
        ))}
      </div>
      <div
        className="grid overflow-hidden rounded-b-lg border-l border-t"
        style={SEVEN_COLUMN_GRID}
      >
        {cells.map(cell => {
          if (cell.kind === 'blank') {
            return <div key={cell.id} className="h-16 border-b border-r bg-gray-50" />;
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
                'h-16 min-w-0 border-b border-r p-1.5 text-left text-xs',
                isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : 'bg-white',
                isToday ? 'font-semibold' : '',
              ].join(' ')}
              aria-label={selectDateLabel(day.date)}
              onClick={() => onSelect(day.date)}
            >
              <span className={isToday ? 'text-blue-700' : 'text-gray-700'}>
                {Number(day.date.slice(8, 10))}
              </span>
              {day.expenseTotal > 0 && (
                <span className="mt-1 block max-w-full truncate text-[10px] font-semibold leading-tight text-red-600">
                  {formatVND(day.expenseTotal, locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
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
        <div role="alert" className="mx-4 mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded bg-red-600 px-3 py-1 text-white"
            onClick={retry}
          >
            {t('cloud.retry')}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 pb-3 text-sm text-gray-500" role="status">
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
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.expense')}</div>
              <div className="text-sm font-semibold text-red-600">{formatVND(monthTotals.expense, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.income')}</div>
              <div className="text-sm font-semibold text-emerald-700">{formatVND(monthTotals.income, locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">{t('calendar.net')}</div>
              <div className="text-sm font-semibold">{formatVND(monthTotals.net, locale)}</div>
            </div>
          </section>

          {!hasMonthTransactions && (
            <div className="px-4 pb-3 text-sm text-gray-500">{t('calendar.emptyMonth')}</div>
          )}

          <section className="px-4">
            <h2 className="pb-2 text-sm uppercase text-gray-500">
              {t('calendar.selectedDate')}: {selectedDate}
            </h2>
            {selectedRows.length === 0 ? (
              <div className="text-sm text-gray-500">{t('calendar.emptyDay')}</div>
            ) : (
              <ul aria-label={t('calendar.selectedDate')} className="divide-y rounded border bg-white">
                {selectedRows.map(row => (
                  <li key={`${row.direction}-${row.category}`} className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{t(`category.${row.category}`)}</div>
                      <div className="text-xs text-gray-500">
                        {t('calendar.transactionCount', { count: row.count })}
                      </div>
                    </div>
                    <div className={`font-semibold ${directionColor(row.direction)}`}>
                      {formatVND(row.total, locale)}
                    </div>
                  </li>
                ))}
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
    <div className="pb-20">
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl leading-none text-gray-700 shadow-sm"
        >
          ‹
        </button>
        <h1 className="text-lg font-semibold">{displayMonth(month)}</h1>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl leading-none text-gray-700 shadow-sm"
        >
          ›
        </button>
      </header>

      <CalendarMonthView key={month} month={month} today={today} locale={locale} />
    </div>
  );
}
