import 'server-only'

export type RraTaxpayerInfo = {
  Tin: string
  TaxPayerName: string
  Status: string
  Entity: string
  Address: string
  District: string
  Sector: string
}

type RraSuccessResponse = {
  MessageCode: 1
  MessageDescription: string
  ResponseObject: RraTaxpayerInfo
}

type RraErrorResponse = {
  MessageCode: 0
  MessageDescription: string
  ResponseObject: { Error: string }
}

type RraResponse = RraSuccessResponse | RraErrorResponse

type RraAuthResponse = {
  access_token?: string
  refresh_token?: string
  token?: string
}

type TokenCache = {
  accessToken: string
  refreshToken: string
  expiresAtMs: number
}

let cachedToken: TokenCache | null = null

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v.trim()
}

function getBaseUrl(): string {
  const raw = requiredEnv('RRA_BASE_URL')
  return raw.replace(/\/+$/, '')
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : trimmed
}

async function authenticate(): Promise<TokenCache> {
  const baseUrl = getBaseUrl()
  const username = requiredEnv('RRA_USERNAME')
  const password = requiredEnv('RRA_PASSWORD')

  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      username,
      password,
    },
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => null)) as RraAuthResponse | null

  if (!res.ok) {
    throw new Error(`RRA authentication failed (${res.status})`)
  }

  const rawAccessToken = json?.access_token ?? json?.token ?? ''
  const accessToken = normalizeToken(rawAccessToken)
  if (!accessToken) {
    throw new Error('RRA authentication succeeded but no access token was returned')
  }

  const refreshToken = normalizeToken(json?.refresh_token ?? '')

  const expiresAtMs = Date.now() + 23 * 60 * 60 * 1000
  return { accessToken, refreshToken, expiresAtMs }
}

async function refreshAccessToken(refreshTok: string): Promise<TokenCache> {
  const baseUrl = getBaseUrl()

  const res = await fetch(`${baseUrl}/api/v1/auth/token/refresh`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshTok}`,
    },
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => null)) as RraAuthResponse | null

  if (!res.ok) {
    throw new Error(`RRA token refresh failed (${res.status})`)
  }

  const rawAccessToken = json?.access_token ?? json?.token ?? ''
  const accessToken = normalizeToken(rawAccessToken)
  if (!accessToken) {
    throw new Error('RRA token refresh succeeded but no access token was returned')
  }

  const newRefreshToken = normalizeToken(json?.refresh_token ?? '') || refreshTok

  const expiresAtMs = Date.now() + 23 * 60 * 60 * 1000
  return { accessToken, refreshToken: newRefreshToken, expiresAtMs }
}

async function getBearerToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs) {
    return cachedToken.accessToken
  }

  if (cachedToken?.refreshToken) {
    try {
      cachedToken = await refreshAccessToken(cachedToken.refreshToken)
      return cachedToken.accessToken
    } catch {
      // Refresh failed — fall through to full re-auth
    }
  }

  cachedToken = await authenticate()
  return cachedToken.accessToken
}

function normalizeTin(input: string): string {
  return String(input || '').replace(/\D/g, '')
}

export async function fetchTaxpayerDetails(tinRaw: string): Promise<RraTaxpayerInfo> {
  const baseUrl = getBaseUrl()
  const tin = normalizeTin(tinRaw)
  if (!/^\d{9}$/.test(tin)) {
    throw new Error('Invalid TIN: must be exactly 9 digits')
  }

  const doRequest = async (token: string) => {
    const res = await fetch(`${baseUrl}/api/v1/tp/tax_payer/RWRB/Details/${tin}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    const json = (await res.json().catch(() => null)) as RraResponse | null
    return { res, json }
  }

  const token1 = await getBearerToken()
  let { res, json } = await doRequest(token1)

  if (res.status === 401) {
    cachedToken = null
    const token2 = await getBearerToken()
    ;({ res, json } = await doRequest(token2))
  }

  if (!res.ok) {
    throw new Error(`RRA request failed (${res.status})`)
  }

  if (!json || typeof json !== 'object' || !('MessageCode' in json)) {
    throw new Error('Unexpected RRA response shape')
  }

  if (json.MessageCode !== 1) {
    const errorMsg =
      json.MessageCode === 0 && 'Error' in json.ResponseObject
        ? json.ResponseObject.Error
        : json.MessageDescription || 'RRA returned an error'
    throw new Error(errorMsg)
  }

  return (json as RraSuccessResponse).ResponseObject
}

export async function verifyTin(tinRaw: string): Promise<{
  tin: string
  taxpayerName: string
  status: string
  entity: string
  address: string
  district: string
  sector: string
}> {
  const info = await fetchTaxpayerDetails(tinRaw)

  return {
    tin: info.Tin,
    taxpayerName: info.TaxPayerName,
    status: info.Status,
    entity: info.Entity,
    address: info.Address,
    district: info.District,
    sector: info.Sector,
  }
}
