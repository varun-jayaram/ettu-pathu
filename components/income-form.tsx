'use client'

import { useActionState } from 'react'
import { addIncome, type FormState } from '@/app/(app)/actions'
import { DateField } from '@/components/date-field'

const SOURCES = [
  ['salary', 'Salary'],
  ['bonus', 'Bonus'],
  ['freelance', 'Freelance'],
  ['interest', 'Interest'],
  ['gift', 'Gift'],
  ['refund', 'Refund'],
  ['other', 'Other'],
] as const

export function IncomeForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addIncome,
    null,
  )

  const field =
    'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700'

  return (
    <form action={formAction}>
      <label className="block text-sm font-medium" htmlFor="income-amount">
        Amount
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-neutral-400">
          €
        </span>
        <input
          id="income-amount"
          name="amount"
          inputMode="decimal"
          type="text"
          required
          placeholder="0,00"
          className="w-full rounded-xl border border-neutral-300 bg-transparent py-4 pl-10 pr-4 text-3xl font-semibold tabular-nums dark:border-neutral-700"
        />
      </div>

      <label className="mt-5 block text-sm font-medium" htmlFor="source">
        Source
      </label>
      <select id="source" name="source" className={field} defaultValue="salary">
        {SOURCES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-neutral-500">
        Only <strong>Salary</strong> moves the pay-cycle start date.
      </p>

      <div className="mt-4">
        <DateField name="received_on" today={today} label="Received on" />
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="income-note">
        Note <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input id="income-note" name="note" type="text" className={field} />

      {state?.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Saving…' : 'Save income'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-500">
        Income always goes to the Joint wallet — you both see it.
      </p>
    </form>
  )
}
