import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { isEffectiveStaffUser, resolveEffectiveRoles } from '@/lib/auth/effective-roles'
import { localFileExists } from '@/lib/documents/file-availability'

export const runtime = 'nodejs'

// Deliberately lightweight: only ever checks the documents of ONE
// application (a handful of `access` calls) so the detail pages can badge
// records whose underlying file was lost (2026-07-08 uploads incident).
// No bulk scanning.

// The same-origin proxy probes below re-enter THIS Node process, so an
// application with many lost files could otherwise fire ~100 self-requests at
// once and starve the single-instance server's own concurrency budget. They
// are therefore run a few at a time, under an overall deadline; anything still
// unprobed when the deadline passes is reported as NEITHER present nor missing
// — its id goes into `unverifiedDocumentIds` so the caller can tell "checked,
// file is there" apart from "we ran out of time". Guessing "present" here would
// silently hide exactly the lost uploads the badge exists for.
const PROXY_PROBE_CONCURRENCY = 5;
const PROXY_PROBE_BUDGET_MS = 8000;

/** Run `worker` over `items`, at most `limit` in flight. Order-independent. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

// Mirrors tryProxyStaticFile in app/api/files/view/route.ts (bounded,
// swallowed, HTML rejected) but uses HEAD — the health check only needs
// existence, not bytes.
async function staticFileReachable(filePath: string, requestUrl: string): Promise<boolean> {
  try {
    const staticUrl = new URL(filePath.startsWith('/') ? filePath : `/${filePath}`, requestUrl).toString()
    const response = await fetch(staticUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return false
    const contentType = response.headers.get('content-type') || ''
    return !contentType.includes('text/html')
  } catch {
    return false
  }
}

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

async function assertApplicationOwnership(applicationId: string, userId: string): Promise<boolean> {
  const res = await query(
    `
    select id
    from public.applications
    where id = $1 and applicant_id = $2
    limit 1
    `,
    [applicationId, userId]
  )
  return Boolean(res.rows[0]?.id)
}

async function isStaffUser(userId: string): Promise<boolean> {
  const resolved = await resolveEffectiveRoles({ userId })
  return isEffectiveStaffUser(resolved.effectiveRoles)
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: applicationId } = await context.params
    const [owned, staff] = await Promise.all([
      assertApplicationOwnership(applicationId, claims.sub),
      isStaffUser(claims.sub),
    ])
    if (!owned && !staff) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    const docs = await query<{ id: string; file_path: string | null }>(
      `
      select id, file_path
      from public.documents
      where application_id = $1
      order by created_at desc
      limit 200
      `,
      [applicationId]
    )

    const missingDocumentIds: string[] = []
    // Pass 1 — local disk only. Cheap `access` calls, left unbounded.
    const needsProxyProbe: Array<{ id: string; filePath: string }> = []
    await Promise.all(
      docs.rows.map(async (row: { id: string; file_path: string | null }) => {
        const filePath = (row.file_path || '').trim()
        // External URLs cannot be cheaply verified — never report them missing.
        if (!filePath || filePath.startsWith('http://') || filePath.startsWith('https://')) return
        if (await localFileExists(filePath)) return
        needsProxyProbe.push({ id: row.id, filePath })
      })
    )

    // Pass 2 — not on local disk. /api/files/view has a same-origin
    // static-proxy fallback for deployments whose uploads are served remotely
    // — mirror it (bounded HEAD, swallowed) so this check never disagrees with
    // the route that actually serves the file. Bounded fan-out + deadline:
    // these requests come back into this very process.
    const deadline = Date.now() + PROXY_PROBE_BUDGET_MS
    const unverifiedDocumentIds: string[] = []
    await runWithConcurrency(needsProxyProbe, PROXY_PROBE_CONCURRENCY, async (doc) => {
      if (Date.now() >= deadline) {
        // Out of time: report it as UNVERIFIED, never as present. These are
        // documents already known to be absent from local disk, so they are
        // the most likely to be lost — claiming they are fine is the one
        // answer we must not give.
        unverifiedDocumentIds.push(doc.id)
        return
      }
      if (await staticFileReachable(doc.filePath, req.url)) return
      missingDocumentIds.push(doc.id)
    })
    if (unverifiedDocumentIds.length > 0) {
      console.warn(
        `⚠️ documents health: proxy probe budget (${PROXY_PROBE_BUDGET_MS}ms) exhausted for application ${applicationId}; ${unverifiedDocumentIds.length} document(s) returned as unverified (status unknown, NOT confirmed present)`
      )
    }

    return NextResponse.json({
      success: true,
      checked: docs.rows.length,
      // Confirmed gone: the file is not on local disk and not reachable via
      // the same-origin static proxy.
      missingDocumentIds,
      // Status UNKNOWN — the probe budget ran out before these were checked.
      // Not a promise that the file exists; a retry may move them into
      // missingDocumentIds.
      unverifiedDocumentIds,
      // True when at least one document could not be checked, i.e. this
      // response is incomplete and worth re-requesting.
      partial: unverifiedDocumentIds.length > 0,
      verified: docs.rows.length - unverifiedDocumentIds.length,
      probeBudgetMs: PROXY_PROBE_BUDGET_MS,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ documents health GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
