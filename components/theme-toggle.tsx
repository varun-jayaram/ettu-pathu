'use client'

import { useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const ORDER: ThemeChoice[] = ['system', 'light', 'dark']

const LABEL: Record<ThemeChoice, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
}

const GLYPH: Record<ThemeChoice, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
}

/** Resolve a choice to the concrete theme actually painted. */
function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolve(choice)
}

/**
 * Cycles Match system → Light → Dark.
 *
 * "System" is kept as a real option rather than a plain on/off, because a phone
 * that switches to dark at sunset should take the app with it unless told
 * otherwise.
 *
 * The choice is read in an effect rather than during render: localStorage does
 * not exist on the server, so reading it during render would produce different
 * markup on each side and a hydration mismatch. The inline script in the root
 * layout has already painted the right theme by then, so there is no flash —
 * only this button's own glyph settles a moment later.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme') as ThemeChoice | null
    if (stored && ORDER.includes(stored)) setChoice(stored)
    setReady(true)
  }, [])

  // While on "system", follow the OS if it changes underneath us.
  useEffect(() => {
    if (choice !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [choice])

  function next() {
    const value = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]
    setChoice(value)
    localStorage.setItem('theme', value)
    apply(value)
  }

  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${LABEL[choice]} — tap to change`}
      aria-label={`Theme: ${LABEL[choice]}. Tap to change.`}
      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-500 dark:border-neutral-700"
    >
      <span aria-hidden>{ready ? GLYPH[choice] : '◐'}</span>
    </button>
  )
}
