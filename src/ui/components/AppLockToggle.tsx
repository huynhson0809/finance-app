import { useEffect, useState } from "react";
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
      setPinError("Mã PIN phải có ít nhất 4 số");
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError("Mã PIN không khớp");
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
            <h2 className="font-semibold text-white">Khoá ứng dụng</h2>
            <p className="text-xs text-slate-400">
              {bioAvailable ? "Face ID / Vân tay + PIN" : "Mã PIN"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={enabled ? handleDisable : handleEnable}
          disabled={busy}
          className={`relative h-7 w-12 rounded-full transition ${
            enabled ? "bg-sky-400" : "bg-slate-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {showPinSetup && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <p className="text-sm text-slate-300">Tạo mã PIN (4-6 số):</p>
          <DarkField label="Mã PIN">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="••••"
              aria-label="Mã PIN"
            />
          </DarkField>
          <DarkField label="Xác nhận PIN">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) =>
                setPinConfirm(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="••••"
              aria-label="Xác nhận PIN"
            />
          </DarkField>
          {pinError && <p className="text-xs text-rose-300">{pinError}</p>}
          <button
            type="button"
            onClick={handleSavePin}
            className="min-h-10 rounded-xl bg-sky-400 px-4 text-sm font-bold text-slate-950"
          >
            Xác nhận
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
