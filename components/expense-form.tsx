'use client'

import { useActionState } from 'react'
import { addExpense, type FormState } from '@/app/(app)/actions'
import type { CategoryGroup, Wallet } from '@/lib/queries'

/**
 * Quick-add — the primary daily action, so it is built for one-handed phone
 * use: the amount field is the largest target, gets autofocus and a decimal
 * keypad, and the date defaults to today so the common case is
 * amount -> category -> save.
 */
export function ExpenseForm({
  wallets,
  groups,
  today,
}: {
  wallets: Wallet[]
  groups: CategoryGroup[]
  today: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addExpense,
    null,
  )

  const field =
    'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700'

  return (
    <form action={formAction}>
      <label className="block text-sm font-medium" htmlFor="amount">
        Amount
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-neutral-400">
          €
        </span>
        <input
          id="amount"
          name="amount"
          // `decimal` so phones show a keypad with a separator, and text so a
          // German comma is accepted — the action normalises it.
          inputMode="decimal"
          type="text"
          autoFocus
          required
          placeholder="0,00"
          className="w-full rounded-xl border border-neutral-300 bg-transparent py-4 pl-10 pr-4 text-3xl font-semibold tabular-nums dark:border-neutral-700"
        />
      </div>

      <label className="mt-5 block text-sm font-medium" htmlFor="wallet_id">
        Wallet
      </label>
      <select id="wallet_id" name="wallet_id" required className={field} defaultValue="">
        <option value="" disabled>
          Choose a wallet…
        </option>
        {wallets.map((wallet) => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.name}
            {wallet.kind === 'personal' ? ' (private)' : ' (shared)'}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-sm font-medium" htmlFor="category_id">
        Category
      </label>
      <select
        id="category_id"
        name="category_id"
        required
        className={field}
        defaultValue=""
      >
        <option value="" disabled>
          Choose a category…
        </option>
        {groups.map((group) => (
          <optgroup key={group.id} label={group.name}>
            {group.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ` : ''}
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <label className="mt-4 block text-sm font-medium" htmlFor="spent_on">
        Date
      </label>
      <input
        id="spent_on"
        name="spent_on"
        type="date"
        required
        defaultValue={today}
        className={field}
      />

      <label className="mt-4 block text-sm font-medium" htmlFor="note">
        Note <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input
        id="note"
        name="note"
        type="text"
        placeholder="Rewe, dinner with S…"
        className={field}
      />

      {state?.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Saving…' : 'Save expense'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-500">
        Personal wallets are private — only you can see them.
      </p>
    </form>
  )
}
