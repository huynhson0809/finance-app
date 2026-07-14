import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import {
  isBiometricAvailable,
  isAppLockEnabled,
  setAppLockEnabled,
  registerBiometric,
  hasPinSet,
  setPin,
  clearPin,
} from "../../lib/app-lock";
import { DarkField, GlassPanel } from "./primitives";

export function AppLockToggle() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(isAppLockEnabled);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    try {
      if (bioAvailable) {
        // Try biometric registration (optional — skip if it fails)
        await registerBiometric();
      }
      // Always require PIN setup
      if (!hasPinSet()) {
        setShowPinSetup(true);
        setBusy(false);
        return;
      }
      setAppLockEnabled(true);
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }

  function handleDisable() {
    setAppLockEnabled(false);
    setEnabled(false);
    clearPin();
  }

  function handleSavePin() {
    if (pinInput.length < 4) {
      setPinError(t("appLock.pinMinError"));
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError(t("appLock.pinMismatch"));
      return;
    }
    void setPin(pinInput).then(() => {
      setAppLockEnabled(true);
      setEnabled(true);
      setShowPinSetup(false);
      setPinInput("");
      setPinConfirm("");
      setPinError(null);
    });
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield aria-hidden="true" className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="font-semibold text-white">{t("appLock.title")}</h2>
            <p className="text-xs text-slate-400">
              {bioAvailable
                ? t("appLock.subtitleBio")
                : t("appLock.subtitlePin")}
            </p>
          </div>
        </div>
        <label className="relative inline-block h-8 w-14 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => (enabled ? handleDisable() : void handleEnable())}
            disabled={busy}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-slate-600 transition-colors peer-checked:bg-sky-400 peer-disabled:opacity-50" />
          <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-6" />
        </label>
      </div>

      {showPinSetup && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <p className="text-sm text-slate-300">{t("appLock.pinSetup")}</p>
          <DarkField label={t("appLock.pin")}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="••••"
              aria-label={t("appLock.pin")}
            />
          </DarkField>
          <DarkField label={t("appLock.pinConfirm")}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) =>
                setPinConfirm(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="••••"
              aria-label={t("appLock.pinConfirm")}
            />
          </DarkField>
          {pinError && <p className="text-xs text-rose-300">{pinError}</p>}
          <button
            type="button"
            onClick={handleSavePin}
            className="min-h-10 rounded-xl bg-sky-400 px-4 text-sm font-bold text-slate-950"
          >
            {t("appLock.confirm")}
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
