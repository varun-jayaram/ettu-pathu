import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for Client Components (forms, interactive widgets).
 *
 * Only ever holds the publishable/anon key plus the logged-in user's JWT, both
 * of which are safe to be public — Row Level Security is what protects the
 * data. See PROJECT.md § Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
