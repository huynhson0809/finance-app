import { useTranslation } from "react-i18next";
import { formatVND } from "../../lib/money";
import { GlassPanel } from "./primitives";

interface YearlySavingsCardProps {
  target: number;
  current: number;
  locale: "vi" | "en";
}

export function YearlySavingsCard({
  target,
  current,
  locale,
}: YearlySavingsCardProps) {
  const { t } = useTranslation();
  if (target <= 0) return null;

  const progress = Math.min(current / target, 1);
  const percentage = Math.round(progress * 100);

  return (
    <GlassPanel className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-300">
          {t("home.savingsGoal")}
        </h2>
        <span className="text-xs text-slate-400">{percentage}%</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold text-emerald-400">
          {formatVND(current, locale)}
        </span>
        <span className="text-sm text-slate-400">
          / {formatVND(target, locale)}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {current >= target && (
        <p className="mt-2 text-xs font-semibold text-emerald-300">
          {t("home.savingsGoalReached")}
        </p>
      )}
    </GlassPanel>
  );
}
