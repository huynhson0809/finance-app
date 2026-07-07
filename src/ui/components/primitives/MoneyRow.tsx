import type { ReactNode } from 'react';

type MoneyTone = 'income' | 'expense' | 'neutral';

const amountTone: Record<MoneyTone, string> = {
  income: 'text-emerald-300',
  expense: 'text-slate-50',
  neutral: 'text-slate-100',
};

export function MoneyRow({
  icon,
  title,
  subtitle,
  amount,
  tone = 'neutral',
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  amount: string;
  tone?: MoneyTone;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-h-[4.5rem] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{title}</div>
          {subtitle && <div className="truncate text-xs text-slate-400">{subtitle}</div>}
          {children}
        </div>
      </div>
      <div className={`shrink-0 text-right text-base font-bold ${amountTone[tone]}`}>{amount}</div>
    </li>
  );
}
