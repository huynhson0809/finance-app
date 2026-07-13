import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useDebts, useDebtPayments } from "../hooks/useDebts";
import { formatVND, parseVNDInput } from "../lib/money";
import {
  DarkField,
  GlassPanel,
  SegmentedControl,
} from "./components/primitives";
import type { Debt, DebtDirection } from "../debts/types";

type ViewState =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "detail"; debt: Debt };

export function DebtManagementScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = (i18n.language === "en" ? "en" : "vi") as "en" | "vi";
  const { debts, paidAmounts, loading, error, addDebt, editDebt, removeDebt } = useDebts();

  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [direction, setDirection] = useState<DebtDirection>("lent");
  const [personName, setPersonName] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const lentDebts = useMemo(
    () => debts.filter((d) => d.direction === "lent"),
    [debts],
  );
  const borrowedDebts = useMemo(
    () => debts.filter((d) => d.direction === "borrowed"),
    [debts],
  );
  const totalLentRemaining = useMemo(
    () =>
      lentDebts
        .filter((d) => !d.settled)
        .reduce((s, d) => s + d.totalAmount, 0),
    [lentDebts],
  );
  const totalBorrowedRemaining = useMemo(
    () =>
      borrowedDebts
        .filter((d) => !d.settled)
        .reduce((s, d) => s + d.totalAmount, 0),
    [borrowedDebts],
  );

  function startNew() {
    setView({ mode: "new" });
    setPersonName("");
    setAmountRaw("");
    setNote("");
    setLocalError(null);
  }

  function openDetail(debt: Debt) {
    setView({ mode: "detail", debt });
    setLocalError(null);
  }

  async function handleSave() {
    const amount = parseVNDInput(amountRaw);
    if (!personName.trim() || Number.isNaN(amount) || amount <= 0) return;
    setBusy(true);
    setLocalError(null);
    try {
      await addDebt({ direction, personName, totalAmount: amount, note });
      setView({ mode: "list" });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleSettled(debt: Debt) {
    setBusy(true);
    try {
      await editDebt(debt.id, { settled: !debt.settled });
      setView({ mode: "list" });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(debt: Debt) {
    if (!confirm(t("debts.deleteConfirm"))) return;
    setBusy(true);
    try {
      await removeDebt(debt.id);
      setView({ mode: "list" });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function renderDebtRow(debt: Debt) {
    const paid = paidAmounts.get(debt.id) ?? 0;
    const progress = debt.totalAmount > 0 ? Math.min(paid / debt.totalAmount, 1) : 0;
    const remaining = Math.max(0, debt.totalAmount - paid);

    return (
      <button
        key={debt.id}
        type="button"
        onClick={() => openDetail(debt)}
        className={`w-full border-b border-white/10 px-4 py-3 text-left last:border-b-0 ${
          debt.settled ? "opacity-50" : ""
        }`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,7.5rem)_1.25rem] items-center gap-2">
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-slate-100">
              {debt.personName}
            </span>
            {debt.note && (
              <span className="block truncate text-xs text-slate-400">
                {debt.note}
              </span>
            )}
          </span>
          <span
            className={`truncate text-right text-base font-bold ${
              debt.direction === "lent" ? "text-sky-400" : "text-rose-400"
            }`}
          >
            {formatVND(debt.totalAmount, locale)}
          </span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
        </div>
        {!debt.settled && paid > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-[0.65rem] text-slate-500">
              <span>{t("debts.paid")}: {formatVND(paid, locale)}</span>
              <span>{t("debts.remaining")}: {formatVND(remaining, locale)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}
        {debt.settled && (
          <span className="mt-1 inline-block text-xs font-semibold text-emerald-400">
            {t("debts.settled")}
          </span>
        )}
      </button>
    );
  }

  if (view.mode === "detail") {
    return (
      <DebtDetailView
        debt={view.debt}
        locale={locale}
        busy={busy}
        onBack={() => setView({ mode: "list" })}
        onToggleSettled={() => void handleToggleSettled(view.debt)}
        onDelete={() => void handleDelete(view.debt)}
      />
    );
  }

  return (
    <div className="space-y-4 px-4 py-5 pb-36 text-slate-100">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t("common.back")}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">
          {t("debts.title")}
        </h1>
        <button
          type="button"
          onClick={startNew}
          aria-label={t("debts.addDebt")}
          className="grid h-11 w-11 place-items-center rounded-full text-sky-300"
        >
          <Plus aria-hidden="true" className="h-7 w-7" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <GlassPanel className="p-3">
          <p className="text-xs text-slate-400">{t("debts.totalLent")}</p>
          <p className="mt-1 text-lg font-bold text-sky-400">
            {formatVND(totalLentRemaining, locale)}
          </p>
        </GlassPanel>
        <GlassPanel className="p-3">
          <p className="text-xs text-slate-400">{t("debts.totalBorrowed")}</p>
          <p className="mt-1 text-lg font-bold text-rose-400">
            {formatVND(totalBorrowedRemaining, locale)}
          </p>
        </GlassPanel>
      </div>

      {view.mode === "new" && (
        <GlassPanel className="space-y-4 p-4">
          <h2 className="text-lg font-bold text-white">{t("debts.addDebt")}</h2>
          <SegmentedControl<DebtDirection>
            ariaLabel="Debt direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "lent", label: t("debts.lent") },
              { value: "borrowed", label: t("debts.borrowed") },
            ]}
          />
          <DarkField label={t("debts.person")}>
            <input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              autoFocus
              aria-label={t("debts.person")}
            />
          </DarkField>
          <DarkField label={t("debts.amount")}>
            <input
              inputMode="numeric"
              value={amountRaw ? amountRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
              onChange={(e) => setAmountRaw(e.target.value.replace(/[^\d]/g, ""))}
              aria-label={t("debts.amount")}
            />
          </DarkField>
          <DarkField label={t("debts.note")}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t("debts.note")}
            />
          </DarkField>

          {localError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
            >
              {localError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !personName.trim() || !amountRaw.trim()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 px-4 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            <Check aria-hidden="true" className="h-5 w-5" />
            {t("debts.save")}
          </button>
        </GlassPanel>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
        >
          {error}
        </div>
      )}

      {loading ? (
        <GlassPanel className="p-4 text-center text-sm text-slate-400">
          Loading...
        </GlassPanel>
      ) : debts.length === 0 ? (
        <GlassPanel className="border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
          {t("debts.noDebts")}
        </GlassPanel>
      ) : (
        <>
          {lentDebts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-400">
                {t("debts.lent")}
              </h2>
              <GlassPanel className="overflow-hidden">
                {lentDebts.map(renderDebtRow)}
              </GlassPanel>
            </section>
          )}
          {borrowedDebts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-400">
                {t("debts.borrowed")}
              </h2>
              <GlassPanel className="overflow-hidden">
                {borrowedDebts.map(renderDebtRow)}
              </GlassPanel>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DebtDetailView({
  debt,
  locale,
  busy: parentBusy,
  onBack,
  onToggleSettled,
  onDelete,
}: {
  debt: Debt;
  locale: "en" | "vi";
  busy: boolean;
  onBack: () => void;
  onToggleSettled: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { payments, loading, addPayment, removePayment } = useDebtPayments(
    debt.id,
  );
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmountRaw, setPaymentAmountRaw] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, debt.totalAmount - paidTotal);
  const progress =
    debt.totalAmount > 0 ? Math.min(paidTotal / debt.totalAmount, 1) : 0;

  async function handleAddPayment() {
    const amount = parseVNDInput(paymentAmountRaw);
    if (Number.isNaN(amount) || amount <= 0) return;
    setBusy(true);
    setLocalError(null);
    try {
      await addPayment({ debtId: debt.id, amount, note: paymentNote });
      setPaymentAmountRaw("");
      setPaymentNote("");
      setShowPaymentForm(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePayment(id: string) {
    setBusy(true);
    try {
      await removePayment(id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5 pb-36 text-slate-100">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">
          {debt.personName}
        </h1>
        <span aria-hidden="true" />
      </header>

      <GlassPanel className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-slate-400">
            {debt.direction === "lent" ? t("debts.lent") : t("debts.borrowed")}
          </span>
          <span
            className={`text-2xl font-bold ${debt.direction === "lent" ? "text-sky-400" : "text-rose-400"}`}
          >
            {formatVND(debt.totalAmount, locale)}
          </span>
        </div>
        {debt.note && (
          <p className="mt-2 text-sm text-slate-400">{debt.note}</p>
        )}

        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400">
            <span>
              {t("debts.paid")}: {formatVND(paidTotal, locale)}
            </span>
            <span>
              {t("debts.remaining")}: {formatVND(remaining, locale)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </GlassPanel>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onToggleSettled}
          disabled={parentBusy}
          className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${
            debt.settled
              ? "bg-slate-700 text-slate-300"
              : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
          }`}
        >
          {debt.settled ? t("debts.markUnsettled") : t("debts.markSettled")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={parentBusy}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-500/10 text-rose-200"
        >
          <Trash2 aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      {!debt.settled && (
        <div>
          <button
            type="button"
            onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("debts.addPayment")}
          </button>

          {showPaymentForm && (
            <GlassPanel className="mt-3 space-y-3 p-4">
              <DarkField label={t("debts.paymentAmount")}>
                <input
                  inputMode="numeric"
                  value={paymentAmountRaw ? paymentAmountRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
                  onChange={(e) => setPaymentAmountRaw(e.target.value.replace(/[^\d]/g, ""))}
                  autoFocus
                  aria-label={t("debts.paymentAmount")}
                />
              </DarkField>
              <DarkField label={t("debts.note")}>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  aria-label={t("debts.note")}
                />
              </DarkField>
              {localError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
                >
                  {localError}
                </div>
              )}
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={busy || !paymentAmountRaw.trim()}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Check aria-hidden="true" className="h-4 w-4" />
                {t("debts.save")}
              </button>
            </GlassPanel>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-400">
          {t("debts.payments")}
        </h2>
        {loading ? (
          <GlassPanel className="p-4 text-center text-sm text-slate-400">
            Loading...
          </GlassPanel>
        ) : payments.length === 0 ? (
          <GlassPanel className="border-dashed border-white/15 p-4 text-center text-sm text-slate-400">
            —
          </GlassPanel>
        ) : (
          <GlassPanel className="overflow-hidden">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-emerald-400">
                    +{formatVND(payment.amount, locale)}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {new Date(payment.paidAt).toLocaleDateString(
                      locale === "vi" ? "vi-VN" : "en-US",
                      {
                        timeZone: "Asia/Ho_Chi_Minh",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      },
                    )}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemovePayment(payment.id)}
                  disabled={busy}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 active:bg-white/10 active:text-rose-300"
                  aria-label={t("debts.delete")}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </GlassPanel>
        )}
      </section>
    </div>
  );
}
