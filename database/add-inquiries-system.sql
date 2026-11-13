-- Inquiries & Ticket-Based Chat System for RWB
-- Supports public/citizen inquiries, chat-style message threads, internal staff notes,
-- and Reviewer -> Assessor / Inspector assignment.

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status_updated ON public.inquiries(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries(assigned_to_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_sender_email ON public.inquiries(lower(sender_email));
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_created ON public.inquiry_messages(inquiry_id, created_at ASC);

