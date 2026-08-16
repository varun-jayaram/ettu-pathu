import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'

/**
 * Shell for every authenticated page.
 *
 * Mobile-first: navigation sits at the bottom on phones, where thumbs are.
 * Quick-add is the most-used screen in the app and gets the emphasised slot.
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
    <div className="min-h-dvh pb-20 sm:pb-0">
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

          <nav className="hidden items-center gap-4 text-sm sm:flex">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/expenses" className="hover:underline">
              Expenses
            </Link>
            <Link href="/budgets" className="hover:underline">
              Budgets
            </Link>
            <Link href="/income" className="hover:underline">
              Income
            </Link>
            <Link href="/recurring" className="hover:underline">
              Recurring
            </Link>
            <Link href="/reports" className="hover:underline">
              Reports
            </Link>
            <Link
              href="/add"
              className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Add
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-neutral-500 hover:underline">
                Sign out
              </button>
            </form>
          </nav>

          <form action={signOut} className="sm:hidden">
            <button type="submit" className="text-sm text-neutral-500">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">{children}</main>

      {/* Bottom bar, phones only. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto grid max-w-2xl grid-cols-5 items-center gap-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Link href="/" className="rounded-lg py-2.5 text-center text-sm">
            Home
          </Link>
          <Link
            href="/add"
            className="rounded-lg bg-neutral-900 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Add
          </Link>
          <Link href="/expenses" className="rounded-lg py-2.5 text-center text-sm">
            Log
          </Link>
          <Link href="/budgets" className="rounded-lg py-2.5 text-center text-sm">
            Budget
          </Link>
          <Link href="/reports" className="rounded-lg py-2.5 text-center text-sm">
            Reports
          </Link>
        </div>
      </nav>
    </div>
  )
}
