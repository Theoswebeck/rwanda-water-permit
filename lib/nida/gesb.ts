import 'server-only'

type GesbAuthSuccess = {
  token: string
  requestId: string
}

type GesbAuthError = {
  message?: string
  requestId?: string
}

export type NidaCitizenInfo = {
  documentNumber?: string
  foreName?: string
  surnames?: string
  dateOfBirth?: string
  village?: string
  cell?: string
  sector?: string
  district?: string
  province?: string
  photo?: string
  maritalStatus?: string
  nin?: string
}

export type GesbCitizenInfoSuccess = {
  serviceName: string
  response: NidaCitizenInfo
  statusMessage: string
  errorCode: number
  responseId: string
}

export type GesbCitizenInfoError = {
  errorCode: number
  errorMessage?: string
  responseId?: string
  serviceName?: string
  statusMessage?: string
}

type TokenCache = { token: string; expiresAtMs: number }

let cachedToken: TokenCache | null = null
let inflightAuth: Promise<TokenCache> | null = null

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v.trim()
}

function getBaseUrl(): string {
  const raw = requiredEnv('NIDA_BASE_URL')
  return raw.replace(/\/+$/, '')
}

function isAuthExpired(cache: TokenCache): boolean {
  // Add a small skew so we refresh before actual expiry.
  return Date.now() > cache.expiresAtMs - 60_000
}

async function authenticate(): Promise<TokenCache> {
  const baseUrl = getBaseUrl()
  const username = requiredEnv('NIDA_USERNAME')
  const password = requiredEnv('NIDA_PASSWORD')

  const res = await fetch(`${baseUrl}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Do not log these credentials.
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => null)) as GesbAuthSuccess | GesbAuthError | null

  if (!res.ok) {
    const msg =
      (json && 'message' in json && json.message) ? json.message : `Authentication failed (${res.status})`
    throw new Error(msg)
  }

  if (!json || !('token' in json) || typeof json.token !== 'string' || !json.token) {
    throw new Error('Authentication succeeded but no token was returned')
  }

  // Token validity is 24 hours per spec; refresh a bit early.
  const expiresAtMs = Date.now() + 23 * 60 * 60 * 1000
  return { token: json.token, expiresAtMs }
}

async function getBearerToken(): Promise<string> {
  if (cachedToken && !isAuthExpired(cachedToken)) return cachedToken.token

  if (!inflightAuth) {
    inflightAuth = (async () => {
      const t = await authenticate()
      cachedToken = t
      return t
    })().finally(() => {
      inflightAuth = null
    })
  }

  const t = await inflightAuth
  return t.token
}

function normalizeDocNumber(input: string): string {
  return String(input || '').replace(/\D/g, '')
}

export async function fetchNidaCitizenInfo(documentNumberRaw: string): Promise<GesbCitizenInfoSuccess> {
  const baseUrl = getBaseUrl()
  const documentNumber = normalizeDocNumber(documentNumberRaw)
  if (!/^\d{16}$/.test(documentNumber)) {
    throw new Error('Invalid documentNumber: must be exactly 16 digits')
  }

  const doRequest = async (token: string) => {
    const res = await fetch(`${baseUrl}/sync/message/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        serviceName: 'rwbcitizeninfo',
      },
      body: JSON.stringify({ args: { documentNumber } }),
      cache: 'no-store',
    })

    const json = (await res.json().catch(() => null)) as
      | GesbCitizenInfoSuccess
      | GesbCitizenInfoError
      | { responseId?: string }
      | null

    return { res, json }
  }

  // Attempt once with cached/new token; on 401, re-auth and retry once.
  const token1 = await getBearerToken()
  let { res, json } = await doRequest(token1)

  if (res.status === 401) {
    cachedToken = null
    const token2 = await getBearerToken()
    ;({ res, json } = await doRequest(token2))
  }

  if (!res.ok) {
    const msg =
      (json && typeof json === 'object' && 'errorMessage' in json && (json as any).errorMessage)
        ? String((json as any).errorMessage)
        : `NIDA request failed (${res.status})`
    throw new Error(msg)
  }

  if (!json || typeof json !== 'object' || !('errorCode' in json)) {
    throw new Error('Unexpected NIDA response shape')
  }

  const success = json as GesbCitizenInfoSuccess
  if (typeof success.errorCode !== 'number') {
    throw new Error('Unexpected NIDA errorCode type')
  }
  if (success.errorCode !== 0) {
    throw new Error(success.statusMessage || 'NIDA returned a non-zero errorCode')
  }

  return success
}

export async function verifyNationalId(documentNumberRaw: string): Promise<{
  documentNumber: string
  nin?: string
  foreName?: string
  surnames?: string
  dateOfBirth?: string
}> {
  const info = await fetchNidaCitizenInfo(documentNumberRaw)
  const doc = normalizeDocNumber(info.response?.documentNumber || documentNumberRaw)

  if (!/^\d{16}$/.test(doc)) {
    throw new Error('NIDA response did not include a valid documentNumber')
  }

  // Minimal verification: data returned + has NIN
  return {
    documentNumber: doc,
    nin: info.response?.nin,
    foreName: info.response?.foreName,
    surnames: info.response?.surnames,
    dateOfBirth: info.response?.dateOfBirth,
  }
}


