import { query } from '@/lib/db/postgres'

export type InquiryStatus = 'open' | 'assigned' | 'in_progress' | 'answered' | 'closed'

export interface InquiryRecord {
  id: string
  inquiry_number: string
  user_id: string | null
  sender_name: string
  sender_email: string
  sender_phone: string | null
  organization: string | null
  category: string
  priority: string
  subject: string
  status: InquiryStatus
  assigned_to_user_id: string | null
  assigned_role: string | null
  assigned_to_name?: string | null
  assigned_to_email?: string | null
  assigned_by_user_id: string | null
  assigned_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  message_count?: number
  last_message?: string | null
}

export interface InquiryMessageRecord {
  id: string
  inquiry_id: string
  sender_type: 'citizen' | 'staff' | 'system'
  sender_user_id: string | null
  sender_name: string
  sender_role: string | null
  message: string
  is_internal_note: boolean
  created_at: string
}

let schemaReadyPromise: Promise<void> | null = null

/**
 * Ensures the `inquiries` and `inquiry_messages` tables exist in PostgreSQL.
 * Runs idempotently once per server process.
 */
export async function ensureInquiriesSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS public.inquiries (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          inquiry_number text NOT NULL UNIQUE,
          user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
          sender_name text NOT NULL,
          sender_email text NOT NULL,
          sender_phone text NULL,
          organization text NULL,
          category text NOT NULL DEFAULT 'general_inquiry',
          priority text NOT NULL DEFAULT 'normal',
          subject text NOT NULL,
          status text NOT NULL DEFAULT 'open',
          assigned_to_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
          assigned_role text NULL,
          assigned_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
          assigned_at timestamptz NULL,
          resolved_at timestamptz NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)

      await query(`
        CREATE TABLE IF NOT EXISTS public.inquiry_messages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
          sender_type text NOT NULL CHECK (sender_type IN ('citizen', 'staff', 'system')),
          sender_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
          sender_name text NOT NULL,
          sender_role text NULL,
          message text NOT NULL,
          is_internal_note boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)

      await query(`CREATE INDEX IF NOT EXISTS idx_inquiries_status_updated ON public.inquiries(status, updated_at DESC)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries(assigned_to_user_id, updated_at DESC)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_inquiries_sender_email ON public.inquiries(lower(sender_email))`)
      await query(`CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_created ON public.inquiry_messages(inquiry_id, created_at ASC)`)
    })().catch((err) => {
      schemaReadyPromise = null
      throw err
    })
  }
  return schemaReadyPromise
}

export async function generateInquiryNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INQ-${year}-`
  const res = await query<{ max_seq: string | null }>(
    `
    SELECT max(substring(inquiry_number FROM '[0-9]+$')::int)::text AS max_seq
    FROM public.inquiries
    WHERE inquiry_number LIKE $1
    `,
    [`${prefix}%`]
  )
  const nextSeq = (parseInt(res.rows[0]?.max_seq || '0', 10) || 0) + 1
  return `${prefix}${String(nextSeq).padStart(5, '0')}`
}

