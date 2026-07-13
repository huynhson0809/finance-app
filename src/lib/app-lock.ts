const LOCK_ENABLED_KEY = 'spendly_lock_enabled';
const BIOMETRIC_CREDENTIAL_KEY = 'spendly_biometric_credential';
const PIN_HASH_KEY = 'spendly_pin_hash';

export function isAppLockEnabled(): boolean {
  return localStorage.getItem(LOCK_ENABLED_KEY) === 'true';
}

export function setAppLockEnabled(enabled: boolean): void {
  localStorage.setItem(LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function hasPinSet(): boolean {
  return localStorage.getItem(PIN_HASH_KEY) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const hash = await hashPin(pin);
  return hash === stored;
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY);
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Spendly', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode('spendly-user'),
          name: 'Spendly User',
          displayName: 'Spendly User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    });
    if (credential && 'rawId' in credential) {
      const id = btoa(String.fromCharCode(...new Uint8Array((credential as PublicKeyCredential).rawId)));
      localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function hasBiometricCredential(): boolean {
  return localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY) !== null;
}

export async function verifyBiometric(): Promise<boolean> {
  const storedId = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  if (!storedId) return false;

  try {
    const rawId = Uint8Array.from(atob(storedId), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type: 'public-key', transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`spendly-pin:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
