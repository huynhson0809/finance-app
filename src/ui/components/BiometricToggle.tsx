import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import {
  isBiometricAvailable,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  registerBiometric,
} from '../../lib/biometric';
import { GlassPanel } from './primitives';

export function BiometricToggle() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(isBiometricLockEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
  }, []);

  if (!available) return null;

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (!enabled) {
        // Enable: register credential first
        const success = await registerBiometric();
        if (success) {
          setBiometricLockEnabled(true);
          setEnabled(true);
        }
      } else {
        setBiometricLockEnabled(false);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield aria-hidden="true" className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="font-semibold text-white">Khoá ứng dụng</h2>
            <p className="text-xs text-slate-400">Face ID / Vân tay</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={busy}
          className={`relative h-7 w-12 rounded-full transition ${
            enabled ? 'bg-sky-400' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </GlassPanel>
  );
}
