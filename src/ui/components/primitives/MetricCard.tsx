type MetricTone = 'neutral' | 'income' | 'expense' | 'primary';

const toneClass: Record<MetricTone, string> = {
  neutral: 'text-slate-100',
  income: 'text-emerald-300',
  expense: 'text-rose-300',
  primary: 'text-sky-300',
};

export function MetricCard({
  label,
  value,
  subtitle,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: MetricTone;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3">
      <div className="truncate text-[0.72rem] font-medium uppercase tracking-normal text-slate-400">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold ${toneClass[tone]}`}>{value}</div>
      {subtitle && <div className="mt-1 truncate text-xs text-slate-400">{subtitle}</div>}
    </div>
  );
}
