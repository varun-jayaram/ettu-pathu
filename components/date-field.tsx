'use client'

import { useRef, useState } from 'react'

/** Today in the BROWSER's timezone, as YYYY-MM-DD.
 *
 * Not the server's: Vercel runs in UTC, so a server-computed default records
 * "yesterday" for anything entered late in a German evening. */
function localToday(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Date input — the native <input type="date">, not a hand-rolled calendar. On a
 * phone it opens the OS date wheel, and it brings keyboard support, locale
 * formatting and screen-reader semantics a custom widget would get wrong.
 *
 * The one thing the native control does badly on desktop: only the small
 * calendar glyph opens the picker, so clicking the field appears to do nothing.
 * showPicker() on click (and on focus) fixes that — the whole field opens the
 * calendar. Both are wrapped because showPicker() throws when unsupported or
 * called outside a user gesture, in which case the plain input still works.
 */
export function DateField({
  name,
  label = 'Date',
  defaultValue,
}: {
  name: string
  label?: string
  defaultValue?: string
}) {
  const [value, setValue] = useState(defaultValue ?? localToday())
  const input = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    try {
      input.current?.showPicker()
    } catch {
      // Unsupported, or not a user gesture — the native input still works.
    }
  }

  const pretty = new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        ref={input}
        id={name}
        name={name}
        type="date"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClick={openPicker}
        onFocus={openPicker}
        className="mt-1 w-full cursor-pointer rounded-lg border border-neutral-300 bg-transparent px-3 py-3 text-base dark:border-neutral-700"
      />
      <p className="mt-1 text-xs text-neutral-500">{pretty}</p>
    </div>
  )
}
