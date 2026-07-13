import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { verifyBiometric, isBiometricLockEnabled } from '../lib/biometric';

export function BiometricLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    setError(false);
    const success = await verifyBiometric();
    if (success) {
      onUnlock();
    } else {
      setError(true);
    }
    setVerifying(false);
  }

  useEffect(() => {
    // Auto-prompt on mount
    void handleVerify();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0e1117] px-6 text-center">
      <ShieldCheck aria-hidden="true" className="h-16 w-16 text-sky-400" />
      <h1 className="text-2xl font-bold text-white">Spendly</h1>
      <p className="text-sm text-slate-400">
        Xác thực để mở ứng dụng
      </p>
      {error && (
        <p className="text-sm text-rose-300">
          Xác thực thất bại. Thử lại.
        </p>
      )}
      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying}
        className="min-h-12 rounded-2xl bg-sky-400 px-6 font-bold text-slate-950 disabled:opacity-50"
      >
        {verifying ? '...' : 'Mở khóa'}
      </button>
    </main>
  );
}

export function useBiometricLock() {
  const [locked, setLocked] = useState(() => isBiometricLockEnabled());

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden' && isBiometricLockEnabled()) {
        setLocked(true);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return {
    locked,
    unlock: () => setLocked(false),
  };
}
