import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Landing point for every emailed auth link: invite, recovery, confirmation.
 *
 * Accepts `?token_hash=&type=` (verified with verifyOtp) or `?code=` (PKCE).
 * scripts/generate-auth-links.mjs deliberately produces the token_hash form so
 * that nothing depends on the URL fragment, which a server never sees.
 *
 * IMPORTANT — why this builds its own Supabase client instead of reusing
 * lib/supabase/server.ts:
 *
 *   In a Route Handler, cookies written through the next/headers `cookies()`
 *   store are attached to the response Next generates for you. Returning your
 *   own NextResponse.redirect() bypasses that, so the refreshed auth cookies
 *   are silently dropped — the token verifies, the redirect fires, and the user
 *   lands back on /login with no session. The redirect response must therefore
 *   be created FIRST and have the cookies written directly onto it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  // Invite and recovery both mean "no password the user chose yet".
  const fallback = type === 'invite' || type === 'recovery' ? '/set-password' : '/'
  const next = searchParams.get('next') ?? fallback

  // Created up front so the cookie writer below has something to write onto.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`)

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    return error ? fail(error.message) : response
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return error ? fail(error.message) : response
  }

  // Nothing server-readable: most likely an implicit-flow link with the session
  // in the fragment. /auth/confirm can read that from the browser.
  return NextResponse.redirect(`${origin}/auth/confirm`)
}
