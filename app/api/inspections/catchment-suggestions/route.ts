import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from '@/lib/auth/session';
import { hasAnyRole, resolveEffectiveRoles } from '@/lib/auth/effective-roles';

// Only staff who actually fill inspections need these suggestions.
const ALLOWED_STAFF_ROLES = [
  'admin',
  'reviewer',
  'approver',
  'verifier',
  'inspector',
  'assessor',
] as const;

// Tiny in-memory cache so repeated typeahead requests don't hammer Postgres.
// Distinct values change slowly; 60s is plenty.
//
// Note: this is a per-instance perf optimization only. Correctness is owned by
// the underlying SQL — stale-by-up-to-60s and per-server-instance is acceptable
// for an autocomplete. Do not promote this to anything authoritative.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; data: { level1: string[]; level2: string[] } } | null = null;

type Row = { value: string | null };

function dedupSorted(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const resolvedRoles = await resolveEffectiveRoles({
      userId,
      claimsRole: claims?.role,
    });
    if (!hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: cache.data });
    }

    // Suggestions must include both:
    //   (a) values stored on the column itself (came from the application form), AND
    //   (b) values typed by assessors into the inspection form, which land in
    //       locked_field_overrides->>'catchmentLevel1' / 'catchmentLevel2'.
    // Without (b), assessors never see catchments other staff have already entered.
    const [level1Res, level2Res] = await Promise.all([
      query<Row>(
        `select distinct btrim(value) as value from (
           select catchment_level1 as value
             from public.inspections
            where catchment_level1 is not null
           union all
           select locked_field_overrides->>'catchmentLevel1' as value
             from public.inspections
            where locked_field_overrides ? 'catchmentLevel1'
         ) s
         where value is not null and btrim(value) <> ''
         order by 1 asc`
      ),
      query<Row>(
        `select distinct btrim(value) as value from (
           select catchment_level2 as value
             from public.inspections
            where catchment_level2 is not null
           union all
           select locked_field_overrides->>'catchmentLevel2' as value
             from public.inspections
            where locked_field_overrides ? 'catchmentLevel2'
         ) s
         where value is not null and btrim(value) <> ''
         order by 1 asc`
      ),
    ]);

    const data = {
      level1: dedupSorted((level1Res.rows || []).map((r: Row) => r.value)),
      level2: dedupSorted((level2Res.rows || []).map((r: Row) => r.value)),
    };

    cache = { at: now, data };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    console.error('❌ inspections/catchment-suggestions error:', err);
    // Soft-fail: return empty suggestions so the field still works as plain input.
    return NextResponse.json({ success: true, data: { level1: [], level2: [] } });
  }
}
