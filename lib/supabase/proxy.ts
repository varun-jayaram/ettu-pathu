import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session on every request and guards protected routes.
 *
 * Two rules here are load-bearing and easy to break by accident:
 *
 *  1. `supabaseResponse` must be returned as-is (or rebuilt carrying its
 *     cookies). Returning a fresh NextResponse drops the rotated auth cookie
 *     and logs the user out at random intervals.
 *  2. Nothing may run between createServerClient() and getUser(). Anything in
 *     between can make the token refresh race and produce the same symptom.
 *
 * `getUser()` — never `getSession()` — because getUser() revalidates the JWT
 * against the Auth server. getSession() trusts the cookie, which is
 * spoofable and must not be the basis of a route guard.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // /login is the only unauthenticated page. There is deliberately no /signup
  // route — public signup is disabled at the Supabase project level too.
  const isPublicRoute = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
