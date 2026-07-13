import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { useCategoryOverrides } from "../hooks/useCategoryOverrides";
import { useCustomCategories } from "../hooks/useCustomCategories";
import { useMonthCloudTransactions } from "../hooks/useCloudTransactions";
import {
  monthOfVietnamDate,
  nextMonth,
  prevMonth,
  todayVietnamDate,
} from "../lib/date";
import { formatCompactVND, formatMoney, formatVND } from "../lib/money";
import {
  calendarDaySummaries,
  initialSelectedDate,
  mondayWeekdayIndex,
} from "../reports";
import type { CalendarDaySummary } from "../reports";
import type { Transaction } from "../types";
import { categoryLabel, getCategoryMeta } from "./theme/categoryMeta";

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEVEN_COLUMN_GRID = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };

function safeMonth(value: string | null, today: string): string {
  return value && VALID_MONTH.test(value) ? value : monthOfVietnamDate(today);
}

function displayMonth(monthISO: string): string {
  const [year, month] = monthISO.split("-");
  return `${month}/${year}`;
}

function daysInMonth(monthISO: string): number {
  const [year, month] = monthISO.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateForMonthDay(monthISO: string, day: number): string {
  return `${monthISO}-${String(day).padStart(2, "0")}`;
}

function displayMonthRange(monthISO: string): string {
  const [year, month] = monthISO.split("-");
  const lastDay = String(daysInMonth(monthISO)).padStart(2, "0");
  return `${month}/${year} (01/${month} - ${lastDay}/${month})`;
}

function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

function weekdayIndex(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
}

function dateGroupTitle(date: string, locale: "en" | "vi"): string {
  const [, month, day] = date.split("-");
  const year = date.slice(0, 4);
  const weekday = weekdayIndex(date);
  const weekdayLabel =
    locale === "vi"
      ? ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"][weekday]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday];

  return `${day}/${month}/${year} (${weekdayLabel})`;
}

function signedAmount(value: number, locale: "en" | "vi"): string {
  if (value > 0) return `+${formatVND(value, locale)}`;
  if (value < 0) return `-${formatVND(Math.abs(value), locale)}`;
  return formatVND(0, locale);
}

function transactionAmount(
  transaction: Transaction,
  locale: "en" | "vi",
): string {
  return transaction.direction === "income"
    ? `+${formatMoney(transaction.amount, transaction.currency, locale)}`
    : `-${formatMoney(transaction.amount, transaction.currency, locale)}`;
}

function transactionTime(iso: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function transactionNote(transaction: Transaction): string | null {
  return transaction.merchant?.trim() || transaction.note?.trim() || null;
}

function calendarCellAmount(value: number, locale: "en" | "vi"): string {
  if (value < 1_000_000) {
    return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
      value,
    );
  }

  return formatCompactVND(value, locale);
}

type CalendarCell =
  | { kind: "adjacent"; date: string }
  | { kind: "day"; day: CalendarDaySummary };

function buildCalendarCells(
  days: CalendarDaySummary[],
  monthISO: string,
): CalendarCell[] {
  const leadingCount = days.length > 0 ? mondayWeekdayIndex(days[0].date) : 0;
  const previousMonth = prevMonth(monthISO);
  const previousMonthDays = daysInMonth(previousMonth);
  const leading: CalendarCell[] = Array.from(
    { length: leadingCount },
    (_, index) => ({
      kind: "adjacent",
      date: dateForMonthDay(
        previousMonth,
        previousMonthDays - leadingCount + index + 1,
      ),
    }),
  );
  const current: CalendarCell[] = days.map((day) => ({ kind: "day", day }));
  const trailingCount = (7 - ((leading.length + current.length) % 7)) % 7;
  const next = nextMonth(monthISO);
  const trailing: CalendarCell[] = Array.from(
    { length: trailingCount },
    (_, index) => ({
      kind: "adjacent",
      date: dateForMonthDay(next, index + 1),
    }),
  );

  return [...leading, ...current, ...trailing];
}

interface CalendarGridProps {
  days: CalendarDaySummary[];
  month: string;
  selectedDate: string;
  today: string;
  weekdays: string[];
  locale: "en" | "vi";
  onSelect: (date: string) => void;
  selectDateLabel: (date: string) => string;
}

function CalendarGrid({
  days,
  month,
  selectedDate,
  today,
  weekdays,
  locale,
  onSelect,
  selectDateLabel,
}: CalendarGridProps) {
  const cells = buildCalendarCells(days, month);

  return (
    <section
      aria-label="Calendar month"
      data-testid="money-note-calendar"
      className="border-b border-zinc-800 bg-[#202020]"
    >
      <div
        className="grid border-y border-zinc-700 text-center text-[11px] font-bold text-zinc-400"
        style={SEVEN_COLUMN_GRID}
      >
        {weekdays.map((day, index) => (
          <div
            key={day}
            className={[
              "py-1.5",
              index === 5 ? "text-sky-400" : "",
              index === 6 ? "text-red-500" : "",
            ].join(" ")}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid" style={SEVEN_COLUMN_GRID}>
        {cells.map((cell) => {
          if (cell.kind === "adjacent") {
            const weekday = mondayWeekdayIndex(cell.date);
            return (
              <div
                key={cell.date}
                className="flex h-[3.95rem] min-w-0 flex-col border-b border-r border-zinc-700 bg-[#242424] px-1 py-1 text-xs text-zinc-500"
              >
                <span
                  className={
                    weekday === 5
                      ? "text-sky-800"
                      : weekday === 6
                        ? "text-red-900"
                        : ""
                  }
                >
                  {dayNumber(cell.date)}
                </span>
              </div>
            );
          }

          const { day } = cell;
          const isSelected = day.date === selectedDate;
          const isToday = day.date === today;
          const weekday = mondayWeekdayIndex(day.date);
          return (
            <button
              key={day.date}
              type="button"
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={[
                "flex h-[3.95rem] min-w-0 flex-col border-b border-r border-zinc-700 px-1 py-1 text-left text-xs transition active:bg-zinc-700",
                isSelected ? "bg-zinc-700" : "bg-[#202020]",
                isToday ? "font-semibold" : "",
              ].join(" ")}
              aria-label={selectDateLabel(day.date)}
              onClick={() => onSelect(day.date)}
            >
              <span
                className={[
                  isToday ? "text-sky-300" : "text-zinc-200",
                  weekday === 5 ? "text-sky-500" : "",
                  weekday === 6 ? "text-red-500" : "",
                ].join(" ")}
              >
                {dayNumber(day.date)}
              </span>
              <span className="mt-auto flex min-w-0 flex-col gap-0.5">
                {day.incomeTotal > 0 && (
                  <span className="block whitespace-nowrap text-right text-[10px] font-semibold leading-none text-sky-500">
                    +{calendarCellAmount(day.incomeTotal, locale)}
                  </span>
                )}
                {day.expenseTotal > 0 && (
                  <span className="block whitespace-nowrap text-right text-[10px] font-semibold leading-none text-red-500">
                    {calendarCellAmount(day.expenseTotal, locale)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MonthSummary({
  income,
  expense,
  net,
  locale,
}: {
  income: number;
  expense: number;
  net: number;
  locale: "en" | "vi";
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("calendar.monthSummary")}
      className="grid grid-cols-3 bg-black px-4 py-3"
    >
      <div className="text-center">
        <div className="text-xs font-semibold text-zinc-300">
          {t("calendar.income")}
        </div>
        <div className="mt-0.5 text-sm font-bold text-sky-500">
          {formatVND(income, locale)}
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-zinc-300">
          {t("calendar.expense")}
        </div>
        <div className="mt-0.5 text-sm font-bold text-red-500">
          {formatVND(expense, locale)}
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-zinc-300">
          {t("calendar.total")}
        </div>
        <div
          className={[
            "mt-0.5 text-sm font-bold",
            net >= 0 ? "text-sky-500" : "text-red-500",
          ].join(" ")}
        >
          {signedAmount(net, locale)}
        </div>
      </div>
    </section>
  );
}

function CalendarLedger({
  transactions,
  selectedDate,
  month,
  hasMonthTransactions,
  locale,
  customCategories,
  categoryOverrides,
}: {
  transactions: Transaction[];
  selectedDate: string;
  month: string;
  hasMonthTransactions: boolean;
  locale: "en" | "vi";
  customCategories: ReturnType<typeof useCustomCategories>["categories"];
  categoryOverrides: ReturnType<typeof useCategoryOverrides>["overrides"];
}) {
  const { t } = useTranslation();
  const totals = transactions.reduce(
    (result, transaction) => {
      if (transaction.direction === "income") {
        return {
          expense: result.expense,
          income: result.income + transaction.amount,
          net: result.net + transaction.amount,
        };
      }

      return {
        expense: result.expense + transaction.amount,
        income: result.income,
        net: result.net - transaction.amount,
      };
    },
    { expense: 0, income: 0, net: 0 },
  );

  if (!hasMonthTransactions) {
    return (
      <div className="px-4 py-4 text-sm text-zinc-400">
        {t("calendar.emptyMonth")}
      </div>
    );
  }

  return (
    <section aria-label={t("calendar.dateGroups")} className="bg-black">
      <article aria-label={dateGroupTitle(selectedDate, locale)}>
        <div className="flex min-h-7 w-full items-center justify-between bg-zinc-700 px-3 text-left text-sm font-semibold text-zinc-100">
          <span>{dateGroupTitle(selectedDate, locale)}</span>
          <span className={totals.net >= 0 ? "text-sky-400" : "text-zinc-100"}>
            {signedAmount(totals.net, locale)}
          </span>
        </div>
        {transactions.length === 0 ? (
          <div className="px-4 py-4 text-sm text-zinc-400">
            {t("calendar.emptyDay")}
          </div>
        ) : (
          <ul>
            {transactions.map((transaction) => {
              const meta = getCategoryMeta(
                transaction.category,
                customCategories,
                categoryOverrides,
              );
              const Icon = meta.Icon;
              const label = categoryLabel(
                transaction.category,
                customCategories,
                t,
                categoryOverrides,
              );
              const note = transactionNote(transaction);
              const subtitle = note
                ? `${note} · ${transactionTime(transaction.occurredAt, locale)}`
                : transactionTime(transaction.occurredAt, locale);
              const amount = transactionAmount(transaction, locale);
              return (
                <li key={transaction.id}>
                  <Link
                    to={`/transactions/${transaction.id}`}
                    state={{
                      backTo: `/calendar?month=${month}&day=${selectedDate}`,
                    }}
                    className="grid min-h-[4.25rem] w-full grid-cols-[2.75rem_minmax(0,1fr)_minmax(5.5rem,7.5rem)_1.25rem] items-center gap-2 border-b border-zinc-900 bg-black px-3 py-2 text-left text-zinc-50 active:bg-zinc-900"
                    aria-label={`${label} ${subtitle} ${amount}`}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg">
                      <Icon
                        aria-hidden="true"
                        className={`h-7 w-7 ${meta.accentClass}`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold">
                        {label}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {subtitle}
                      </span>
                    </span>
                    <span
                      className={[
                        "truncate whitespace-nowrap text-right text-base font-bold",
                        transaction.direction === "income"
                          ? "text-sky-500"
                          : "text-zinc-50",
                      ].join(" ")}
                    >
                      {amount}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-5 w-5 text-zinc-500"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}

interface CalendarMonthViewProps {
  month: string;
  today: string;
  locale: "en" | "vi";
}

function CalendarMonthView({ month, today, locale }: CalendarMonthViewProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    data: transactions,
    loading,
    error,
    reload,
  } = useMonthCloudTransactions(month);
  const { categories: customCategories } = useCustomCategories();
  const { overrides: categoryOverrides } = useCategoryOverrides();
  const [manualSelection, setManualSelection] = useState<string | null>(() =>
    searchParams.get("day"),
  );

  const daySummaries = useMemo(
    () => calendarDaySummaries(transactions, month),
    [transactions, month],
  );
  const monthTotals = useMemo(
    () =>
      daySummaries.reduce(
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
  const selectedTransactions = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            todayVietnamDate(new Date(transaction.occurredAt)) === selectedDate,
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [transactions, selectedDate],
  );
  const hasMonthTransactions = transactions.some(
    (transaction) =>
      todayVietnamDate(new Date(transaction.occurredAt)).slice(0, 7) === month,
  );

  function selectDate(date: string) {
    setManualSelection(date);
  }

  function retry() {
    void reload();
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mx-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100"
        >
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 rounded-xl bg-rose-400 px-3 py-1 font-semibold text-slate-950"
            onClick={retry}
          >
            {t("cloud.retry")}
          </button>
        </div>
      )}

      {loading && (
        <div className="px-4 text-sm text-slate-400" role="status">
          {t("cloud.loading")}
        </div>
      )}

      {!loading && !error && (
        <>
          <CalendarGrid
            days={daySummaries}
            month={month}
            selectedDate={selectedDate}
            today={today}
            weekdays={
              t("calendar.weekdays", { returnObjects: true }) as string[]
            }
            locale={locale}
            onSelect={selectDate}
            selectDateLabel={(date) => t("calendar.selectDate", { date })}
          />

          <MonthSummary
            income={monthTotals.income}
            expense={monthTotals.expense}
            net={monthTotals.net}
            locale={locale}
          />

          <CalendarLedger
            transactions={selectedTransactions}
            selectedDate={selectedDate}
            month={month}
            hasMonthTransactions={hasMonthTransactions}
            locale={locale}
            customCategories={customCategories}
            categoryOverrides={categoryOverrides}
          />
        </>
      )}
    </>
  );
}

export function CalendarScreen() {
  const { i18n, t } = useTranslation();
  const locale = (i18n.language === "en" ? "en" : "vi") as "en" | "vi";
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayVietnamDate();
  const month = safeMonth(searchParams.get("month"), today);

  function step(direction: -1 | 1) {
    const next = direction === -1 ? prevMonth(month) : nextMonth(month);
    setSearchParams({ month: next });
  }

  return (
    <div className="pb-24 text-slate-100">
      <header className="relative flex min-h-16 items-center justify-center border-b border-zinc-900 bg-black px-4">
        <h1 className="text-xl font-bold text-white">{t("calendar.title")}</h1>
        <Link
          to="/settings/reports/search"
          aria-label={t("reports.search")}
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 active:bg-white/10"
        >
          <Search aria-hidden="true" className="h-7 w-7" />
        </Link>
      </header>

      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 bg-[#202020] px-2 py-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-3xl leading-none text-zinc-100 active:bg-white/10"
        >
          ‹
        </button>
        <div className="rounded-md bg-zinc-800 px-3 py-2 text-center">
          <span className="text-lg font-bold text-white">
            {displayMonth(month)}
          </span>
          <span className="ml-2 text-xs font-semibold text-zinc-300">
            {displayMonthRange(month).replace(displayMonth(month), "")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-3xl leading-none text-zinc-100 active:bg-white/10"
        >
          ›
        </button>
      </div>

      <CalendarMonthView
        key={month}
        month={month}
        today={today}
        locale={locale}
      />
    </div>
  );
}
