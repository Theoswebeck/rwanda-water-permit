import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getAuthenticatedUserId } from '@/app/api/transfers/_utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isValidRating = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication required. Please sign in again.' },
        { status: 401 }
      )
    }

    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ success: false, message: 'Invalid user session.' }, { status: 401 })
    }

    const body = await req.json()
    const applicationId = body?.applicationId
    const feedbackText = body?.feedbackText
    const rating = body?.rating

    if (!isNonEmpty(applicationId) || !UUID_RE.test(applicationId)) {
      return NextResponse.json({ success: false, message: 'Invalid application identifier.' }, { status: 400 })
    }

    if (!isNonEmpty(feedbackText)) {
      return NextResponse.json({ success: false, message: 'Feedback cannot be empty.' }, { status: 400 })
    }

    const normalizedFeedback = feedbackText.trim()
    if (!normalizedFeedback) {
      return NextResponse.json({ success: false, message: 'Feedback cannot be empty.' }, { status: 400 })
    }

    const normalizedRating = rating == null ? null : Number(rating)
    if (normalizedRating !== null && !isValidRating(normalizedRating)) {
      return NextResponse.json({ success: false, message: 'Rating must be between 1 and 5.' }, { status: 400 })
    }

    const appResult = await query<{ id: string }>(
      `
      select id
      from public.applications
      where id = $1
      limit 1
      `,
      [applicationId]
    )
    if (!appResult.rows[0]) {
      return NextResponse.json({ success: false, message: 'Application not found.' }, { status: 404 })
    }

    await query(
      `
      insert into public.portal_feedback (
        user_id,
        application_id,
        rating,
        feedback_text,
        feedback_type,
        created_at,
        updated_at
      ) values ($1, $2, $3, $4, 'terms_acceptance', now(), now())
      `,
      [userId, applicationId, normalizedRating, normalizedFeedback]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as { code?: unknown; message?: unknown } | null
    const code = String(err?.code || '')
    const message = String(err?.message || '')

    if (code === '23503') {
      return NextResponse.json(
        { success: false, message: 'Your user profile is incomplete. Please contact support.' },
        { status: 400 }
      )
    }
    if (code === '23514') {
      return NextResponse.json(
        { success: false, message: 'Rating must be between 1 and 5.' },
        { status: 400 }
      )
    }

    console.error('❌ feedback/submit error:', error)
    return NextResponse.json(
      { success: false, message: message || 'Failed to submit feedback. Please try again.' },
      { status: 500 }
    )
  }
}
