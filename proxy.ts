import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next.js 16 renamed Middleware to Proxy — this file is `proxy.ts`, not
 * `middleware.ts`, and exports `proxy`. Functionality is unchanged.
 * See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 *
 * This refreshes the auth session on every request. It is NOT the security
 * boundary — Postgres RLS is. A redirect here is a UX convenience; the data
 * would be unreadable even without it.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth routes are handled
     * inside updateSession rather than excluded here, so that a logged-in user
     * hitting /login still gets redirected home.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
