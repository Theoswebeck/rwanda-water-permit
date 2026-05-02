import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId } from '@/app/api/transfers/_utils'

const ALLOWED_FIELDS = [
  'status', 'water_source', 'authorized_activity', 'volume_or_area', 'location',
  'issuance_date', 'expiration_date', 'permit_holder', 'latitude', 'longitude',
  'duration', 'contact', 'method_of_water_taking', 'regime',
] as const

/**
 * POST /api/permit-registry/sync
 *
 * Server-side proxy for permit_registry updates.
 * The browser Supabase client cannot update permit_registry due to RLS
 * (only the service role has UPDATE access). This route uses the direct
 * postgres connection (lib/db/postgres) which bypasses RLS.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const permitNumber = typeof body?.permitNumber === 'string' ? body.permitNumber.trim() : ''
    if (!permitNumber) {
      return NextResponse.json({ success: false, message: 'permitNumber is required' }, { status: 400 })
    }

    const updates = body?.updates as Record<string, unknown> | undefined
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ success: false, message: 'updates is required' }, { status: 400 })
    }

    // Find matching registry rows (exact match first, then case-insensitive fallback).
    let matchIds: string[] = []
    try {
      const exactRes = await query<{ id: string }>(
        `SELECT id FROM permit_registry WHERE permit_number = $1 AND deleted_at IS NULL`,
        [permitNumber]
      )
      matchIds = exactRes.rows.map((r: { id: string }) => r.id)
    } catch (selectErr) {
      // deleted_at column may not exist yet (pre-migration)
      const msg = selectErr instanceof Error ? selectErr.message : String(selectErr)
      if (msg.includes('deleted_at')) {
        const exactRes = await query<{ id: string }>(
          `SELECT id FROM permit_registry WHERE permit_number = $1`,
          [permitNumber]
        )
        matchIds = exactRes.rows.map((r: { id: string }) => r.id)
      } else {
        throw selectErr
      }
    }

    if (matchIds.length === 0) {
      // Case-insensitive fallback
      try {
        const fuzzyRes = await query<{ id: string }>(
          `SELECT id FROM permit_registry WHERE LOWER(permit_number) = LOWER($1) AND deleted_at IS NULL`,
          [permitNumber]
        )
        matchIds = fuzzyRes.rows.map((r: { id: string }) => r.id)
      } catch {
        const fuzzyRes = await query<{ id: string }>(
          `SELECT id FROM permit_registry WHERE LOWER(permit_number) = LOWER($1)`,
          [permitNumber]
        )
        matchIds = fuzzyRes.rows.map((r: { id: string }) => r.id)
      }
    }

    if (matchIds.length === 0) {
      console.log(`permit-registry/sync: no matching row for "${permitNumber}"`)
      return NextResponse.json({ success: true, synced: false })
    }

    // Build parameterized UPDATE
    const params: unknown[] = []
    const setClauses: string[] = []

    for (const field of ALLOWED_FIELDS) {
      const val = updates[field]
      if (val != null && val !== '') {
        params.push(val)
        setClauses.push(`${field} = $${params.length}`)
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: true, synced: false, message: 'No fields to update' })
    }

    setClauses.push('updated_at = NOW()')
    params.push(matchIds)
    const idParam = `$${params.length}`

    await query(
      `UPDATE permit_registry SET ${setClauses.join(', ')} WHERE id = ANY(${idParam}::uuid[])`,
      params
    )

    console.log(`✅ permit-registry/sync: updated ${matchIds.length} row(s) for "${permitNumber}"`)
    return NextResponse.json({ success: true, synced: true })
  } catch (err) {
    console.error('❌ permit-registry/sync error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
