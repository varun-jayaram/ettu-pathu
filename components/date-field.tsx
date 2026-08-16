'use client'

import { useRef, useState } from 'react'

/**
 * Date input.
 *
 * Deliberately the NATIVE <input type="date"> rather than a hand-rolled
 * calendar: on a phone it opens the OS date wheel, and it comes with keyboard
 * support, locale formatting and screen-reader semantics a custom widget would
 * have to reimplement and would get wrong.
 *
 * Clicking anywhere on the field opens the picker. showPicker() is not
 * universal, so the plain input remains the fallback where it is unsupported
 * or blocked outside a user gesture.
 */
export function DateField({
  name,
  today,
  label = 'Date',
}: {
  name: string
  today: string
  label?: string
}) {
  const [value, setValue] = useState(today)
  const input = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    try {
      input.current?.showPicker()
    } catch {
      // Unsupported or blocked — the native input still works on its own.
    }
  }

  const pretty = new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: value.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
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
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700"
      />
      <p className="mt-1 text-xs text-neutral-500">{pretty}</p>
    </div>
  )
}
