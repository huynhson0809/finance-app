import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AssetSummary } from '../../assets/types';
import { formatVND } from '../../lib/money';

interface AssetSummaryCardProps {
  summary?: AssetSummary;
  loading?: boolean;
  error?: Error | string | null;
  locale: 'en' | 'vi';
}

export function AssetSummaryCard({
  summary,
  loading = false,
  error = null,
  locale,
}: AssetSummaryCardProps) {
  const { t } = useTranslation();
  const hasAssets = (summary?.byAccount.length ?? 0) > 0;
  const totalAssets = summary?.totalAssetsVnd ?? 0;

  return (
    <Link
      to="/assets"
      aria-label={t('home.assets')}
      className="block rounded-lg border border-white/10 bg-zinc-900 px-3 py-3 text-zinc-50 shadow-[0_14px_30px_rgba(0,0,0,0.28)] transition hover:border-white/20 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{t('home.assets')}</div>
          <div className="mt-1 truncate text-2xl font-bold text-zinc-50">{formatVND(totalAssets, locale)}</div>
        </div>
        <ChevronRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-zinc-500" />
      </div>

      {loading ? (
        <div className="mt-3 text-sm text-zinc-400">{t('home.assetsLoading')}</div>
      ) : error ? (
        <div className="mt-3 text-sm text-rose-200">{t('home.assetsError')}</div>
      ) : hasAssets ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <AssetChip label={t('home.liquid')} value={formatVND(summary?.liquidVnd ?? 0, locale)} tone="liquid" />
          <AssetChip label={t('home.savings')} value={formatVND(summary?.savingsVnd ?? 0, locale)} tone="savings" />
          <AssetChip label={t('home.liability')} value={formatLiability(summary?.liabilityVnd ?? 0, locale)} tone="liability" />
        </div>
      ) : (
        <div className="mt-3 text-sm font-medium text-zinc-400">{t('home.noAssets')}</div>
      )}
    </Link>
  );
}

function AssetChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'liquid' | 'savings' | 'liability';
}) {
  const toneClass = tone === 'liability'
    ? 'text-rose-300'
    : tone === 'savings'
      ? 'text-emerald-300'
      : 'text-sky-300';

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
      <div className="truncate text-[0.68rem] font-semibold text-zinc-400">{label}</div>
      <div className={`mt-1 truncate text-xs font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function formatLiability(amount: number, locale: 'en' | 'vi'): string {
  if (amount <= 0) return formatVND(0, locale);
  return `-${formatVND(amount, locale)}`;
}
