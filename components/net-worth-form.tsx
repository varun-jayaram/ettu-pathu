'use client'

import { useActionState } from 'react'
import { addNetWorthItem, type FormState } from '@/app/(app)/actions'
import { TOWARDS_WHAT_LABEL } from '@/components/towards-what'

/**
 * Adds a loan or an investment.
 *
 * One component for both, with `kind` as a hidden input, because the two are
 * the same shape — an amount, a monthly payment, a name and an optional end
 * date. Only the wording and which figure is mandatory differ, and a second
 * near-identical form would drift from this one.
 *
 * The headline field is the BALANCE — still owed, or worth now — because that
 * is the number net worth is made of and the one that gets changed again later.
 * The full amount or target is secondary and optional: since 0020 it only draws
 * a progress bar.
 */
export function NetWorthForm({ kind }: { kind: 'loan' | 'investment' }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addNetWorthItem,
    null,
  )

  const field =
    'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700'

  const isLoan = kind === 'loan'

  return (
    <form action={formAction}>
      <input type="hidden" name="kind" value={kind} />

      <label className="block text-sm font-medium" htmlFor={`${kind}-current`}>
        {isLoan ? 'Still owed' : 'Worth now'}
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-neutral-400">
          €
        </span>
        <input
          id={`${kind}-current`}
          name="current_amount"
          // `decimal` for a phone keypad, `text` so a German comma survives —
          // the action normalises it.
          inputMode="decimal"
          type="text"
          required
          placeholder="0,00"
          className="w-full rounded-xl border border-neutral-300 bg-transparent py-4 pl-10 pr-4 text-3xl font-semibold tabular-nums dark:border-neutral-700"
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {isLoan
          ? 'What is left to pay today. Change it on the Net worth tab whenever you pay some off.'
          : 'What it is worth today, not what you have put in. Change it on the Net worth tab whenever it moves.'}
      </p>

      <label className="mt-5 block text-sm font-medium" htmlFor={`${kind}-name`}>
        {isLoan ? 'What loan is it?' : 'What investment is it?'}
      </label>
      <input
        id={`${kind}-name`}
        name="name"
        type="text"
        required
        placeholder={isLoan ? 'Car loan' : 'Index fund'}
        className={field}
      />
      <p className="mt-1 text-xs text-neutral-500">
        Also the name you can optionally tag a payment with under “
        {TOWARDS_WHAT_LABEL}”, so make it one you will recognise.
      </p>


      <label className="mt-4 block text-sm font-medium" htmlFor={`${kind}-total`}>
        {isLoan ? 'Full amount of the loan' : 'Target'}{' '}
        <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input
        id={`${kind}-total`}
        name="total_amount"
        inputMode="decimal"
        type="text"
        placeholder="0,00"
        className={field}
      />
      <p className="mt-1 text-xs text-neutral-500">
        Only draws a progress bar. Leave it blank and you just get the figure.
      </p>

      <label className="mt-4 block text-sm font-medium" htmlFor={`${kind}-monthly`}>
        Monthly payment{' '}
        <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input
        id={`${kind}-monthly`}
        name="monthly_amount"
        inputMode="decimal"
        type="text"
        placeholder="0,00"
        className={field}
      />
      <p className="mt-1 text-xs text-neutral-500">
        Shown beside the entry. Nothing is calculated from it.
      </p>

      <label className="mt-4 block text-sm font-medium" htmlFor={`${kind}-ends`}>
        {isLoan ? 'End of loan' : 'Ends'}{' '}
        <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input id={`${kind}-ends`} name="ends_on" type="date" className={field} />

      {state?.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Saving…' : isLoan ? 'Save loan' : 'Save investment'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-500">
        Loans and investments are shared — you both see them.
      </p>
    </form>
  )
}
