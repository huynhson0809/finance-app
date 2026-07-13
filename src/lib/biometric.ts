const BIOMETRIC_ENABLED_KEY = 'spendly_biometric_lock';
const BIOMETRIC_CREDENTIAL_KEY = 'spendly_biometric_credential';

export function isBiometricLockEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
}

export function setBiometricLockEnabled(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
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
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
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

export async function verifyBiometric(): Promise<boolean> {
  const storedId = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  if (!storedId) {
    // No credential stored, try simple verification
    return simpleVerify();
  }

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

async function simpleVerify(): Promise<boolean> {
  // Fallback: create a new credential with userVerification required
  // This will prompt Face ID/Touch ID without needing a stored credential
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}
