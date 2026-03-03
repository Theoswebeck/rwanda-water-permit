import { supabase } from '@/lib/selfhosted-supabase-client'

export function createClient() {
  return supabase
}
