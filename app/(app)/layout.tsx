import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'
import { DesktopNav, MobileNav } from '@/components/nav'

/**
 * Shell for every authenticated page.
 *
 * Mobile-first: navigation sits at the bottom on phones, where thumbs are, with
 * quick-add as a round button in the middle — the most-used action, and shaped
 * so it is never mistaken for the selected tab.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 p-4">
          <Link href="/" className="min-w-0">
            <span className="block truncate font-semibold tracking-tight">
              Varavu Ettu Selavu Pathu
            </span>
            <span className="block truncate text-xs text-neutral-500">
              {user?.email}
            </span>
          </Link>

          <DesktopNav signOut={signOut} />

          <form action={signOut} className="sm:hidden">
            <button type="submit" className="text-sm text-neutral-500">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">{children}</main>

      <MobileNav />
    </div>
  )
}
