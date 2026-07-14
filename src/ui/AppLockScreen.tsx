import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Delete } from "lucide-react";
import {
  isAppLockEnabled,
  isBiometricAvailable,
  hasBiometricCredential,
  verifyBiometric,
  verifyPin,
  getPinLength,
} from "../lib/app-lock";

const MAX_BIOMETRIC_ATTEMPTS = 3;

export function AppLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<"biometric" | "pin">("biometric");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [biometricAttempts, setBiometricAttempts] = useState(0);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    // Check if biometric is available, otherwise go straight to PIN
    let cancelled = false;
    (async () => {
      const bioAvailable = await isBiometricAvailable();
      const hasCredential = hasBiometricCredential();
      if (cancelled) return;
      if (!bioAvailable || !hasCredential) {
        setMode("pin");
        return;
      }
      // Auto-prompt biometric with a timeout fallback
      setVerifying(true);
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          setMode("pin");
          setVerifying(false);
        }
      }, 5000); // If no response in 5s, biometric likely not working
      const success = await verifyBiometric();
      clearTimeout(timeoutId);
      if (cancelled) return;
      setVerifying(false);
      if (success) {
        onUnlock();
      } else {
        setBiometricAttempts(1);
        setError("Thất bại (1/3)");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBiometric() {
    setVerifying(true);
    setError(null);
    const success = await verifyBiometric();
    if (success) {
      onUnlock();
    } else {
      const attempts = biometricAttempts + 1;
      setBiometricAttempts(attempts);
      if (attempts >= MAX_BIOMETRIC_ATTEMPTS) {
        setMode("pin");
        setError("Xác thực sinh trắc thất bại. Nhập mã PIN.");
      } else {
        setError(`Thất bại (${attempts}/${MAX_BIOMETRIC_ATTEMPTS})`);
      }
    }
    setVerifying(false);
  }

  const pinLength = getPinLength();

  function handlePinKey(digit: string) {
    if (pin.length >= pinLength) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === pinLength) {
      setTimeout(() => {
        void (async () => {
          setVerifying(true);
          setError(null);
          const success = await verifyPin(next);
          if (success) {
            onUnlock();
          } else {
            setError("Mã PIN sai");
            setPin("");
          }
          setVerifying(false);
        })();
      }, 100);
    }
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
  }

  if (mode === "biometric") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0e1117] px-6 text-center">
        <ShieldCheck aria-hidden="true" className="h-16 w-16 text-sky-400" />
        <h1 className="text-2xl font-bold text-white">Spendly</h1>
        <p className="text-sm text-slate-400">Xác thực để mở ứng dụng</p>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="button"
          onClick={handleBiometric}
          disabled={verifying}
          className="min-h-12 rounded-2xl bg-sky-400 px-6 font-bold text-slate-950 disabled:opacity-50"
        >
          {verifying ? "..." : "Mở khóa"}
        </button>
        <button
          type="button"
          onClick={() => setMode("pin")}
          className="text-sm text-slate-400 underline"
        >
          Dùng mã PIN
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0e1117] px-6 text-center">
      <ShieldCheck aria-hidden="true" className="h-12 w-12 text-sky-400" />
      <h1 className="text-xl font-bold text-white">Nhập mã PIN</h1>
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex gap-3">
        {Array.from({ length: pinLength }, (_, i) => (
          <div
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${
              i < pin.length ? "bg-sky-400" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      <div className="grid w-full max-w-[16rem] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handlePinKey(d)}
            disabled={verifying}
            className="flex h-14 items-center justify-center rounded-full bg-white/[0.07] text-xl font-semibold text-white active:bg-white/15"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => handlePinKey("0")}
          disabled={verifying}
          className="flex h-14 items-center justify-center rounded-full bg-white/[0.07] text-xl font-semibold text-white active:bg-white/15"
        >
          0
        </button>
        <button
          type="button"
          onClick={handlePinDelete}
          disabled={verifying}
          className="flex h-14 items-center justify-center rounded-full text-slate-400 active:bg-white/10"
        >
          <Delete aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      {biometricAttempts < MAX_BIOMETRIC_ATTEMPTS &&
        hasBiometricCredential() && (
          <button
            type="button"
            onClick={() => {
              setMode("biometric");
              void handleBiometric();
            }}
            className="text-sm text-slate-400 underline"
          >
            Dùng Face ID / Vân tay
          </button>
        )}
    </main>
  );
}

export function useAppLock() {
  const [locked, setLocked] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const LOCK_AFTER_MS = 1000; // Lock after 1 second away

  useEffect(() => {
    if (!isAppLockEnabled()) return;

    function markActive() {
      lastActiveRef.current = Date.now();
    }

    function checkAndLock() {
      if (!isAppLockEnabled()) return;
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= LOCK_AFTER_MS) {
        setLocked(true);
      }
    }

    // Multiple events for maximum reliability on iOS
    function handleHidden() {
      lastActiveRef.current = Date.now();
    }

    function handleVisible() {
      if (isAppLockEnabled()) {
        checkAndLock();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        handleHidden();
      } else {
        handleVisible();
      }
    }

    function handlePageShow() {
      handleVisible();
    }

    function handleFocus() {
      handleVisible();
    }

    function handleBlur() {
      handleHidden();
    }

    // Register all events for redundancy
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Also check periodically (catches edge cases on iOS)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && isAppLockEnabled()) {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed >= LOCK_AFTER_MS && !locked) {
          setLocked(true);
        }
      }
    }, 500);

    // Mark as active on user interaction
    document.addEventListener("touchstart", markActive, { passive: true });
    document.addEventListener("click", markActive);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("touchstart", markActive);
      document.removeEventListener("click", markActive);
      clearInterval(interval);
    };
  }, [locked]);

  return {
    locked,
    unlock: () => {
      lastActiveRef.current = Date.now();
      setLocked(false);
    },
  };
}
