'use client'

import { useActionState } from 'react'
import { addRecurringRule, type FormState } from '@/app/(app)/actions'
import type { CategoryGroup, Wallet } from '@/lib/queries'
import { DateField } from '@/components/date-field'

/**
 * Create a recurring rule. This is how the Committed floor fills itself in
 * instead of being retyped every month.
 */
export function RecurringForm({
  wallets,
  groups,
}: {
  wallets: Wallet[]
  groups: CategoryGroup[]
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addRecurringRule,
    null,
  )

  const field =
    'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700'

  return (
    <form action={formAction}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium" htmlFor="rec-amount">
            Amount
          </label>
          <input
            id="rec-amount"
            name="amount"
            inputMode="decimal"
            type="text"
            required
            placeholder="1200,00"
            className={field}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="day_of_month">
            Day of month
          </label>
          <input
            id="day_of_month"
            name="day_of_month"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={1}
            className={field}
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        The 31st becomes the 28th in February — it never skips a month.
      </p>

      <label className="mt-4 block text-sm font-medium" htmlFor="rec-category">
        Category
      </label>
      <select id="rec-category" name="category_id" required className={field} defaultValue="">
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

      <label className="mt-4 block text-sm font-medium" htmlFor="rec-wallet">
        Wallet
      </label>
      <select id="rec-wallet" name="wallet_id" required className={field} defaultValue="">
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

      <div className="mt-4">
        <DateField name="start_date" label="Starting from" />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Back-date this and every occurrence since will be filled in at once.
      </p>

      <label className="mt-4 block text-sm font-medium" htmlFor="rec-note">
        Note <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input id="rec-note" name="note" type="text" className={field} />

      {state?.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Saving…' : 'Create recurring expense'}
      </button>
    </form>
  )
}
