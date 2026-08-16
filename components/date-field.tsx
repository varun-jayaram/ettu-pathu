'use client'

import { useRef, useState } from 'react'
import { addDays } from '@/lib/period'

/**
 * Date input with quick-select chips.
 *
 * Deliberately keeps the NATIVE <input type="date"> rather than a hand-rolled
 * calendar: on a phone it opens the OS date wheel, and it comes with keyboard
 * support, locale formatting and screen-reader semantics that a custom widget
 * would have to reimplement and would get wrong.
 *
 * What the native control is bad at is the common case. Almost every expense is
 * logged today or yesterday, and reaching those through a calendar popup is
 * several taps. The chips make those one tap and leave the picker for the rest.
 *
 * Clicking the field itself opens the picker too — showPicker() is not
 * universal, so the plain input remains the fallback.
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

  const yesterday = addDays(today, -1)
  const dayBefore = addDays(today, -2)

  const chips: [string, string][] = [
    ['Today', today],
    ['Yesterday', yesterday],
    [
      new Date(`${dayBefore}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        timeZone: 'UTC',
      }),
      dayBefore,
    ],
  ]

  const openPicker = () => {
    try {
      input.current?.showPicker()
    } catch {
      // Unsupported or blocked (not a user gesture) — the native input still
      // works on its own.
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
      <span className="block text-sm font-medium">{label}</span>

      <div className="mt-1 flex flex-wrap gap-2">
        {chips.map(([chipLabel, chipValue]) => {
          const selected = value === chipValue
          return (
            <button
              key={chipValue}
              type="button"
              onClick={() => setValue(chipValue)}
              aria-pressed={selected}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                selected
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {chipLabel}
            </button>
          )
        })}

        <button
          type="button"
          onClick={openPicker}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            chips.some(([, chipValue]) => chipValue === value)
              ? 'border-neutral-300 dark:border-neutral-700'
              : 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
          }`}
        >
          Pick a date…
        </button>
      </div>

      <input
        ref={input}
        id={name}
        name={name}
        type="date"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClick={openPicker}
        className="mt-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700"
      />

      <p className="mt-1 text-xs text-neutral-500">{pretty}</p>
    </div>
  )
}
