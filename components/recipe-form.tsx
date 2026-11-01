'use client'

import { useActionState } from 'react'
import { addRecipe, type RecipeFormState } from '@/app/(app)/actions'
import { fieldClass } from '@/components/edit-dialog'
import { RECIPE_TYPES } from '@/lib/recipes'

/** The type picker, shared by this form and the edit dialog. No hooks, so it
 *  renders on the server inside the dialog too. */
export function RecipeTypeSelect({
  id,
  defaultValue,
}: {
  id?: string
  defaultValue?: string | null
}) {
  return (
    <select
      id={id}
      name="recipe_type"
      required
      defaultValue={defaultValue ?? ''}
      className={fieldClass}
    >
      {/* A prompt, not a value: `required` refuses it, so a type is always
          chosen on purpose rather than defaulted. */}
      <option value="" disabled>
        Choose…
      </option>
      {RECIPE_TYPES.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Adds a recipe. Only the title and type are required — a dish you cook from
 * memory is still worth planning with, and a form that demanded a method would
 * never get filled in for those.
 *
 * On an error the action returns what was typed, and the fields take it as
 * their default: React 19 resets the form after every action, so without this
 * a failed save would wipe the ingredients and method.
 *
 * `week` rides along so saving returns to the week you were planning.
 */
export function RecipeForm({ week }: { week: string }) {
  const [state, formAction, pending] = useActionState<RecipeFormState, FormData>(
    addRecipe,
    null,
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="week" value={week} />

      <label className="block text-sm font-medium" htmlFor="recipe-title">
        Title
      </label>
      <input
        id="recipe-title"
        name="title"
        type="text"
        required
        defaultValue={state?.values?.title}
        placeholder="Paneer butter masala"
        className={fieldClass}
      />

      <label className="mt-4 block text-sm font-medium" htmlFor="recipe-type">
        Type
      </label>
      <RecipeTypeSelect id="recipe-type" defaultValue={state?.values?.recipe_type} />

      <label className="mt-4 block text-sm font-medium" htmlFor="recipe-ingredients">
        Ingredients <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <textarea
        id="recipe-ingredients"
        name="ingredients"
        rows={5}
        defaultValue={state?.values?.ingredients}
        placeholder={'200 g paneer\n2 tomatoes\n1 onion'}
        className={fieldClass}
      />
      <p className="mt-1 text-xs text-neutral-500">One per line.</p>

      <label className="mt-4 block text-sm font-medium" htmlFor="recipe-method">
        Method <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <textarea
        id="recipe-method"
        name="method"
        rows={5}
        defaultValue={state?.values?.method}
        className={fieldClass}
      />

      {state?.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Saving…' : 'Save recipe'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-500">
        Recipes are shared — you both see them.
      </p>
    </form>
  )
}
