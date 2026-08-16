'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Fallback for Supabase's implicit flow, where the emailed link delivers tokens
 * in the URL fragment (#access_token=...). Fragments are never sent to the
 * server, so this has to run in the browser.
 *
 * createBrowserClient has detectSessionInUrl on by default: it parses the
 * fragment, establishes the session and writes the auth cookies. All we do is
 * wait for that to land and then move the user on.
 */
export default function ConfirmPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // The hash carries an explicit error (expired or already-used link).
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hash.get('error_description') ?? hash.get('error')
    if (hashError) {
      setError(hashError.replace(/\+/g, ' '))
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/set-password')
      } else {
        setError('This link is invalid or has already been used.')
      }
    })
  }, [router])

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Link didn&apos;t work</h1>
            <p className="mt-2 text-sm text-neutral-500">{error}</p>
            <p className="mt-4 text-sm text-neutral-500">
              Ask for a fresh invite from the Supabase dashboard.
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Signing you in…</p>
        )}
      </div>
    </main>
  )
}
