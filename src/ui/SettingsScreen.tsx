import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChartPie,
  ChevronRight,
  History,
  Info,
  Search,
  TrendingUp,
} from "lucide-react";
import { setLocale, type Locale } from "../i18n";
import { upsertBudget, getBudgetForMonth } from "../db/budgets";
import { monthOfVietnamDate, todayVietnamDate } from "../lib/date";
import { parseVNDInput } from "../lib/money";
import { CapsEditor } from "./components/CapsEditor";
import type { Category } from "../types";
import { useAuth } from "../hooks/useAuth";
import { GlassPanel, DarkField } from "./components/primitives";
import { ApiKeysSection } from "./components/ApiKeysSection";
import { CsvSection } from "./components/CsvSection";
import { AppLockToggle } from "./components/AppLockToggle";

const reportLinks = [
  {
    labelKey: "settings.reports.yearlyReport",
    href: "/settings/reports/year-summary",
    Icon: CalendarDays,
  },
  {
    labelKey: "settings.reports.yearlyCategoryReport",
    href: "/settings/reports/year-category",
    Icon: ChartPie,
  },
  {
    labelKey: "settings.reports.allTimeReport",
    href: "/settings/reports/all-summary",
    Icon: History,
  },
  {
    labelKey: "settings.reports.allTimeCategoryReport",
    href: "/settings/reports/all-category",
    Icon: ChartNoAxesCombined,
  },
  {
    labelKey: "settings.reports.balanceChangeReport",
    href: "/settings/reports/balance-change",
    Icon: TrendingUp,
  },
  {
    labelKey: "settings.reports.searchTransactions",
    href: "/settings/reports/search",
    Icon: Search,
  },
] as const;

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const month = monthOfVietnamDate(todayVietnamDate());
  const [raw, setRaw] = useState("");
  const [caps, setCaps] = useState<Partial<Record<Category, number>>>({});
  const [total, setTotal] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [emailAutomationDetailsOpen, setEmailAutomationDetailsOpen] =
    useState(false);
  const emailAutomationDetailsId = "settings-email-automation-details";

  useEffect(() => {
    getBudgetForMonth(month).then((b) => {
      if (b) {
        setRaw(String(b.total));
        setTotal(b.total);
        setCaps(b.caps ?? {});
      }
    });
  }, [month]);

  async function handleLocale(l: Locale) {
    await setLocale(l);
  }

  async function handleSaveBudget() {
    const parsed = parseVNDInput(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    await upsertBudget(month, parsed, caps);
    setTotal(parsed);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <header>
        <h1 className="text-3xl font-bold text-white">{t("settings.title")}</h1>
      </header>

      <GlassPanel aria-label={t("settings.language")} className="p-4">
        <h2 className="font-semibold text-white">{t("settings.language")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["vi", "en"] as Locale[]).map((l) => (
            <label
              key={l}
              className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-3 text-slate-100"
            >
              <input
                type="radio"
                name="locale"
                checked={i18n.language === l}
                onChange={() => handleLocale(l)}
              />
              {l === "vi" ? "Tiếng Việt" : "English"}
            </label>
          ))}
        </div>
      </GlassPanel>

      <AppLockToggle />

      <GlassPanel aria-label={t("settings.reports.title")} className="p-4">
        <h2 className="font-semibold text-white">
          {t("settings.reports.title")}
        </h2>
        <div className="mt-3 space-y-2">
          {reportLinks.map(({ labelKey, href, Icon }) => (
            <Link
              key={href}
              to={href}
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3 font-semibold text-slate-100 transition hover:border-sky-300/40 hover:bg-sky-300/10 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            >
              <Icon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-sky-300"
              />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel aria-label={t("settings.monthlyBudget")} className="p-4">
        <h2 className="font-semibold text-white">
          {t("settings.monthlyBudget")}
        </h2>
        <div className="mt-3">
          <DarkField label={t("settings.monthlyBudget")}>
            <input
              inputMode="numeric"
              value={raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
            />
          </DarkField>
        </div>
        <button
          type="button"
          onClick={handleSaveBudget}
          className="mt-3 min-h-12 rounded-2xl bg-sky-400 px-4 font-bold text-slate-950"
        >
          {t("settings.save")}
        </button>

        {total > 0 && (
          <div className="mt-4">
            <CapsEditor
              month={month}
              total={total}
              initialCaps={caps}
              onSaved={() =>
                getBudgetForMonth(month).then((b) => b && setCaps(b.caps ?? {}))
              }
            />
          </div>
        )}
      </GlassPanel>

      <GlassPanel
        aria-label={t("settings.emailAutomation.title")}
        className="p-4"
      >
        <div className="flex min-h-12 items-center justify-between gap-3">
          <h2 className="font-semibold text-white">
            {t("settings.emailAutomation.title")}
          </h2>
          <button
            type="button"
            aria-expanded={emailAutomationDetailsOpen}
            aria-controls={emailAutomationDetailsId}
            aria-label={t(
              emailAutomationDetailsOpen
                ? "settings.emailAutomation.hideDetails"
                : "settings.emailAutomation.showDetails",
            )}
            title={t(
              emailAutomationDetailsOpen
                ? "settings.emailAutomation.hideDetails"
                : "settings.emailAutomation.showDetails",
            )}
            onClick={() => setEmailAutomationDetailsOpen((open) => !open)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-sky-300 transition hover:border-sky-300/40 hover:bg-sky-300/10 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          >
            <Info aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {emailAutomationDetailsOpen && (
          <div
            id={emailAutomationDetailsId}
            className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm leading-relaxed text-slate-300"
          >
            <p>{t("settings.emailAutomation.description")}</p>
            <p>{t("settings.emailAutomation.device")}</p>
            <p>{t("settings.emailAutomation.banks")}</p>
            <p className="font-semibold text-sky-300">
              {t("settings.emailAutomation.contact")}
            </p>
          </div>
        )}
        <Link
          to="/ingest-logs"
          className="mt-3 flex min-h-10 items-center justify-between rounded-xl border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/40"
        >
          <span>Automation Logs</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-500" />
        </Link>
      </GlassPanel>

      <ApiKeysSection />

      <CsvSection />

      <GlassPanel aria-label={t("settings.account")} className="p-4">
        <h2 className="font-semibold text-white">{t("settings.account")}</h2>
        {signOutError && (
          <div
            role="alert"
            className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
          >
            {t("settings.signOutFailed")}: {signOutError}
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="mt-3 min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 font-semibold text-slate-100 disabled:opacity-60"
        >
          {signingOut ? t("settings.signingOut") : t("settings.signOut")}
        </button>
      </GlassPanel>
    </div>
  );
}
