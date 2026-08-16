'use client'

import { useRef } from 'react'

/**
 * Delete behind a confirmation dialog.
 *
 * A bare × beside a money row is one mis-tap from destroying a record, and on a
 * phone the target sits right under the thumb. This shows what is about to go,
 * with its amount, and puts Cancel where the thumb already is.
 *
 * Uses the native <dialog>: it gets focus trapping, Escape-to-close and the
 * top layer for free, none of which is worth reimplementing.
 *
 * The server action is passed in as a prop — Server Actions are serialisable
 * references, so the delete still runs on the server and RLS still governs
 * whether it is allowed.
 */
export function ConfirmDelete({
  action,
  id,
  title,
  detail,
  amount,
}: {
  action: (formData: FormData) => Promise<void>
  id: string
  title: string
  detail?: string
  amount: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Delete ${title}`}
        // Generous hit area — the visible glyph is small, the target is not.
        className="-m-2 p-2 text-neutral-400 hover:text-red-600"
      >
        ×
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 backdrop:bg-black/50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <h2 className="text-base font-semibold">Delete this?</h2>

        <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{title}</span>
            <span className="shrink-0 tabular-nums text-sm font-medium">{amount}</span>
          </div>
          {detail && <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p>}
        </div>

        <p className="mt-3 text-sm text-neutral-500">This cannot be undone.</p>

        <div className="mt-5 flex gap-2">
          {/* method="dialog" closes without submitting anything. */}
          <form method="dialog" className="flex-1">
            <button
              type="submit"
              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium dark:border-neutral-700"
            >
              Cancel
            </button>
          </form>
          <form action={action} className="flex-1">
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              Delete
            </button>
          </form>
        </div>
      </dialog>
    </>
  )
}
