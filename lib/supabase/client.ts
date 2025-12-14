import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Use untyped Supabase client for now.
  // Our local `types/database.ts` `Database` interface isn't a 1:1 match with the
  // Supabase CLI-generated schema shape (Relationships, Views, etc.), and using it
  // here causes tables to be inferred as `never` across the app.
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
