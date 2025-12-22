import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase admin client (service role).
 * Only import this from server contexts (API routes, server actions).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}


