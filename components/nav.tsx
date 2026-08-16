'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navigation.
 *
 * Add used to be a filled rectangle sitting among the tabs, which read as "you
 * are here" — it was emphasis, but emphasis and selection looked identical, and
 * nothing showed the actual current page. Two fixes: the current tab is now
 * genuinely marked, and Add is a CIRCLE, so it is distinguished by shape rather
 * than by the fill that selection uses.
 */
const TABS = [
  { href: '/', label: 'Home' },
  { href: '/expenses', label: 'Log' },
  { href: '/budgets', label: 'Plan' },
  { href: '/income', label: 'Income' },
  { href: '/reports', label: 'Reports' },
] as const

function useIsActive() {
  const pathname = usePathname()
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function DesktopNav({ signOut }: { signOut: () => Promise<void> }) {
  const isActive = useIsActive()

  return (
    <nav className="hidden items-center gap-4 text-sm sm:flex">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={isActive(tab.href) ? 'page' : undefined}
          className={
            isActive(tab.href)
              ? 'font-medium underline underline-offset-4'
              : 'text-neutral-500 hover:underline'
          }
        >
          {tab.label}
        </Link>
      ))}
      <Link
        href="/add"
        className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        + Add
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-neutral-500 hover:underline">
          Sign out
        </button>
      </form>
    </nav>
  )
}

export function MobileNav() {
  const isActive = useIsActive()

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-2xl items-center justify-around gap-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        {/* Round, so it never reads as a selected tab. */}
        <Link
          href="/add"
          aria-label="Add expense"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-2xl leading-none text-white dark:bg-white dark:text-neutral-900"
        >
          +
        </Link>

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex-1 rounded-lg py-2 text-center text-xs ${
        active
          ? 'font-semibold text-neutral-900 dark:text-white'
          : 'text-neutral-500'
      }`}
    >
      {label}
      {/* A dot rather than a fill: selection and the Add accent must not look
          the same. */}
      <span
        aria-hidden
        className={`mx-auto mt-1 block h-1 w-1 rounded-full ${
          active ? 'bg-neutral-900 dark:bg-white' : 'bg-transparent'
        }`}
      />
    </Link>
  )
}
