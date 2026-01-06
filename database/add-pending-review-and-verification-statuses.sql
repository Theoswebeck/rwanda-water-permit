-- Add new workflow statuses for the updated staff flow:
-- submitted -> pending_assessment -> pending_review -> pending_verification -> pending_final_approval
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pending_verification';


