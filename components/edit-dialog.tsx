'use client'

import { useRef, useState, useTransition } from 'react'

/**
 * Edit-in-a-dialog, the counterpart to ConfirmDelete.
 *
 * The fields are passed in as children so each entity supplies its own, while
 * the dialog shell, the hidden id, and the Cancel/Save pair stay in one place.
 * Children are server-rendered, which keeps the category and wallet lists on
 * the server where they are already loaded.
 *
 * Submission is handled in JS rather than by letting the form post directly.
 * A native <dialog> stays open until something calls close(), and a plain
 * `action={serverAction}` never does — so Save appeared to do nothing even
 * though the write had gone through. Calling the action inside a transition
 * lets us show a pending state and close only once it has actually finished.
 */
export function EditDialog({
  action,
  id,
  title,
  label = 'Edit',
  children,
}: {
  action: (formData: FormData) => Promise<void>
  id: string
  title: string
  label?: string
  children: React.ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)

    startTransition(async () => {
      try {
        await action(formData)
        dialog.current?.close()
      } catch {
        // Keep the dialog open so the edit is not lost.
        setError('Could not save. Please try again.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`${label} ${title}`}
        className="-m-2 p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
      >
        ✎
      </button>

      <dialog
        ref={dialog}
        onClose={() => setError(null)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 backdrop:bg-black/50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <h2 className="text-base font-semibold">{title}</h2>

        <form onSubmit={onSubmit} className="mt-4">
          <input type="hidden" name="id" value={id} />

          <div className="space-y-3">{children}</div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium dark:border-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

/** Field wrapper, so every dialog's inputs line up the same way. */
export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

export const fieldClass =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base dark:border-neutral-700'
