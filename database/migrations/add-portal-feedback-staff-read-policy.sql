INSERT INTO public.portal_feedback (
  user_id,
  application_id,
  rating,
  feedback_text,
  feedback_type,
  created_at,
  updated_at
)
SELECT
  af.user_id,
  af.application_id,
  af.rating,
  af.feedback_text,
  'terms_acceptance',
  af.created_at,
  COALESCE(af.updated_at, af.created_at, NOW())
FROM public.application_feedback af
WHERE NOT EXISTS (
  SELECT 1
  FROM public.portal_feedback pf
  WHERE pf.user_id IS NOT DISTINCT FROM af.user_id
    AND pf.application_id IS NOT DISTINCT FROM af.application_id
    AND pf.rating IS NOT DISTINCT FROM af.rating
    AND pf.feedback_text IS NOT DISTINCT FROM af.feedback_text
    AND pf.created_at IS NOT DISTINCT FROM af.created_at
);

DROP POLICY IF EXISTS "Staff can view all portal feedback" ON public.portal_feedback;

CREATE POLICY "Staff can view all portal feedback"
ON public.portal_feedback
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = ANY (
        ARRAY[
          'assessor'::public.user_role,
          'reviewer'::public.user_role,
          'verifier'::public.user_role,
          'inspector'::public.user_role,
          'approver'::public.user_role,
          'admin'::public.user_role
        ]
      )
  )
);
