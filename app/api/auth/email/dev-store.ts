type DevEmailCodeRecord = {
  code: string;
  purpose: string;
  email: string;
  expiresAtMs: number;
  attempts: number;
  maxAttempts: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __devEmailCodes: Map<string, DevEmailCodeRecord> | undefined;
}

function getStore() {
  if (!globalThis.__devEmailCodes) {
    globalThis.__devEmailCodes = new Map<string, DevEmailCodeRecord>();
  }
  return globalThis.__devEmailCodes;
}

function key(email: string, purpose: string) {
  return `${email.toLowerCase()}::${purpose}`;
}

export function setDevEmailCode(params: { email: string; purpose: string; code: string; ttlMinutes?: number }) {
  const ttlMinutes = params.ttlMinutes ?? 15;
  const rec: DevEmailCodeRecord = {
    email: params.email.toLowerCase(),
    purpose: params.purpose,
    code: params.code,
    expiresAtMs: Date.now() + ttlMinutes * 60 * 1000,
    attempts: 0,
    maxAttempts: 5,
  };
  getStore().set(key(rec.email, rec.purpose), rec);
}

export function verifyDevEmailCode(params: { email: string; purpose: string; code: string }) {
  const k = key(params.email, params.purpose);
  const rec = getStore().get(k);
  if (!rec) return { ok: false, reason: "missing" as const };
  if (Date.now() > rec.expiresAtMs) return { ok: false, reason: "expired" as const };
  if (rec.attempts >= rec.maxAttempts) return { ok: false, reason: "max_attempts" as const };

  rec.attempts += 1;
  getStore().set(k, rec);

  if (rec.code !== params.code) return { ok: false, reason: "mismatch" as const };

  // consume
  getStore().delete(k);
  return { ok: true as const };
}






