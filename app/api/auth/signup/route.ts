import { NextRequest, NextResponse } from 'next/server'
import { verifyNationalId } from '@/lib/nida/gesb'
import { query } from '@/lib/db/postgres'
import { hashPassword } from '@/lib/auth/password'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // DEBUG: Log the raw body to see exactly what frontend is sending
    console.log('📥 signup raw body:', JSON.stringify(body, null, 2))
    const { email, password, accountType, emailCode, ...rest } = body || {}

    if (!email || !password || !accountType) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    // Feature flag: keep NIDA verification off unless explicitly enabled.
    // Set `NIDA_VERIFICATION_ENABLED=true` to enforce verification.
    const nidaVerificationEnabled = process.env.NIDA_VERIFICATION_ENABLED === 'true'

    // Validate required fields for organizational signups (DB constraint chk_organizational_fields)
    if (accountType !== 'individual') {
      const missing: string[] = []
      const companyName = String(rest?.companyName ?? '').trim()
      const companyTIN = String(rest?.companyTIN ?? '').trim()
      const companyAddress = String(rest?.companyAddress ?? '').trim()
      const companyPhone = String(rest?.companyPhone ?? '').trim()
      if (!companyName) missing.push('companyName')
      if (!companyTIN) missing.push('companyTIN')
      if (!companyAddress) missing.push('companyAddress')
      if (!companyPhone) missing.push('companyPhone')
      if (missing.length) {
        return NextResponse.json(
          { success: false, message: `Missing required company fields: ${missing.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate ID number for individual signups (must be exactly 16 digits)
    if (accountType === 'individual') {
      const rawId = String(rest?.identification?.number ?? rest?.idNumber ?? '')
      const idDigits = rawId.replace(/\D/g, '')
      if (idDigits.length !== 16 || !/^\d{16}$/.test(idDigits)) {
        return NextResponse.json({ success: false, message: 'invalid ID number' }, { status: 400 })
      }
    }

    // NIDA verification for individual signups (before creating any auth user/profile)
    if (accountType === 'individual' && nidaVerificationEnabled) {
      const rawId = String(rest?.identification?.number ?? rest?.idNumber ?? '')
      const idDigits = rawId.replace(/\D/g, '')
      try {
        const v = await verifyNationalId(idDigits)
        // Defensive: ensure we have a matching documentNumber back.
        if (v.documentNumber !== idDigits) {
          return NextResponse.json({ success: false, message: 'National ID could not be verified' }, { status: 400 })
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'National ID could not be verified'
        // Avoid leaking internal details in prod; keep errors actionable in dev/UAT.
        const safeMessage =
          process.env.NODE_ENV === 'production' ? 'National ID could not be verified' : `National ID verification failed: ${message}`
        return NextResponse.json({ success: false, message: safeMessage }, { status: 400 })
      }
    }

    // Validate date of birth for individual signups (must be 18+)
    if (accountType === 'individual') {
      const dob = String(rest?.dateOfBirth ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return NextResponse.json({ success: false, message: 'invalid date of birth' }, { status: 400 })
      }
      const dobUtc = new Date(`${dob}T00:00:00.000Z`)
      if (Number.isNaN(dobUtc.getTime())) {
        return NextResponse.json({ success: false, message: 'invalid date of birth' }, { status: 400 })
      }
      const now = new Date()
      const cutoffUtc = new Date(Date.UTC(
        now.getUTCFullYear() - 18,
        now.getUTCMonth(),
        now.getUTCDate()
      ))
      if (dobUtc.getTime() > cutoffUtc.getTime()) {
        return NextResponse.json({ success: false, message: 'must be at least 18 years old' }, { status: 400 })
      }
    }

    const emailLower = String(email).trim().toLowerCase()
    const passwordHash = await hashPassword(String(password))

    const existing = await query<{ id: string }>(
      `select id from public.users where lower(email) = $1 limit 1`,
      [emailLower]
    )
    if (existing.rows[0]?.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            'An account with this email already exists. Please log in instead, or delete the existing user before signing up again.',
        },
        { status: 409 }
      )
    }

    const isIndividual = accountType === 'individual'
    const idDigits = String(rest?.identification?.number || rest?.idNumber || '').replace(/\D/g, '')

    const inserted = await query<{ id: string }>(
      `
      insert into public.users (
        email,
        password_hash,
        role,
        status,
        account_type,
        id_type,
        id_number,
        first_name,
        last_name,
        date_of_birth,
        phone,
        province,
        company_name,
        company_tin,
        company_address,
        company_phone,
        applications_count,
        reviews_count,
        inspections_count,
        profile_completed,
        account_confirmed,
        email_verified
      ) values (
        $1, $2, 'applicant', 'active', $3::public.account_type, $4::public.id_type, $5,
        $6, $7, $8::date, $9, $10::public.province_type,
        $11, $12, $13, $14,
        0, 0, 0, false, false, false
      )
      returning id
      `,
      [
        emailLower,
        passwordHash,
        isIndividual ? 'individual' : 'company',
        isIndividual ? 'national_id' : 'tin',
        isIndividual ? idDigits : String(rest?.companyTIN || ''),
        isIndividual ? String(rest?.firstName || 'User') : null,
        isIndividual ? String(rest?.lastName || 'Profile') : null,
        isIndividual ? String(rest?.dateOfBirth || '') : null,
        isIndividual ? String(rest?.phone || '') : null,
        isIndividual ? (rest?.province || null) : null,
        isIndividual ? null : String(rest?.companyName || ''),
        isIndividual ? null : String(rest?.companyTIN || ''),
        isIndividual ? null : String(rest?.companyAddress || ''),
        isIndividual ? null : String(rest?.companyPhone || ''),
      ]
    )

    return NextResponse.json({ success: true, userId: inserted.rows[0]?.id })
  } catch (err) {
    console.error('❌ signup server error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('users_email_key')) {
      return NextResponse.json(
        {
          success: false,
          message:
            'An account with this email already exists. Please log in instead, or delete the existing user before signing up again.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}


