import Link from 'next/link'
import {
  copyLastWeek,
  setMeal,
  toggleRecipe,
  updateRecipe,
} from '../actions'
import {
  getMeals,
  getRecipes,
  type Meal,
  type MealKind,
  type MealSlot,
  type Recipe,
} from '@/lib/queries'
import { todayIso } from '@/lib/period'
import {
  dayLabel,
  mondayOf,
  parseWeekParam,
  shiftWeek,
  weekDays,
  weekLabel,
} from '@/lib/week'
import { AutoSubmitSelect } from '@/components/auto-submit-select'
import { RecipeForm, RecipeTypeSelect } from '@/components/recipe-form'
import { groupByType } from '@/lib/recipes'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'

/**
 * Meals — recipes, the week's plan, and what actually happened.
 *
 * NO MONEY ON THIS TAB. Planning the week is how it serves the budget: a
 * planned week has fewer takeaways. Nothing here reads or writes an expense,
 * and eating out is a kind of meal, not an amount. See 0023 and PROJECT.md.
 *
 * THE WEEK IS MONDAY–SUNDAY AND IGNORES THE HEADER MONTH. Weeks and pay cycles
 * never line up, so this tab has its own navigator, in the URL rather than a
 * cookie: a week is a page you are looking at, not a mode for the whole app.
 *
 * Days from today on are PLANNED. Days before today are RECORDED — and only
 * what changed needs a tap, because "✓ as planned" is one press.
 */

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'brunch', label: 'Brunch' },
  { slot: 'dinner', label: 'Dinner' },
]

const EATING_OUT = 'Eating out'

/** The <select> value for a kind + recipe pair; the inverse of parseMealValue. */
function toValue(kind: MealKind | null, recipeId: string | null): string {
  if (kind === 'eating_out') return 'eating_out'
  if (kind === 'recipe' && recipeId) return `recipe:${recipeId}`
  return ''
}

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; added?: string }>
}) {
  const params = await searchParams

  const today = todayIso()
  const thisWeek = mondayOf(today)
  const monday = parseWeekParam(params.week) ?? thisWeek
  const days = weekDays(monday)
  const isThisWeek = monday === thisWeek

  const [recipes, meals] = await Promise.all([
    getRecipes(),
    getMeals(days[0], days[6]),
  ])

  const byId = new Map(recipes.map((r) => [r.id, r]))
  const active = recipes.filter((r) => r.active)
  const archived = recipes.filter((r) => !r.active)
  const mealAt = new Map(meals.map((m) => [`${m.day}|${m.slot}`, m]))

  // An archived recipe stays choosable only where this week already uses it,
  // so its slot still shows the right name rather than falling back to blank.
  const usedArchived = archived.filter((r) =>
    meals.some((m) => m.planned_recipe_id === r.id || m.actual_recipe_id === r.id),
  )
  const choices = [...active, ...usedArchived]

  function name(kind: MealKind | null, recipeId: string | null): string {
    if (kind === 'eating_out') return EATING_OUT
    if (kind === 'recipe' && recipeId) return byId.get(recipeId)?.title ?? 'Unknown recipe'
    return 'Not planned'
  }

  const summary = summarise(meals, days, today)

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Meals</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Plan the week, then note what really happened
      </p>

      {params.added && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Saved.
        </p>
      )}

      {/* The week navigator. Amber off the current week, like the header month,
          so a past week is never mistaken for this one. */}
      <nav aria-label="Week" className="mt-4 flex items-center justify-center gap-1.5">
        <Link
          href={`/meals?week=${shiftWeek(monday, -1)}`}
          aria-label="Previous week"
          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm leading-none dark:border-neutral-700"
        >
          ←
        </Link>
        <span
          className={`whitespace-nowrap px-1 text-sm tabular-nums ${
            isThisWeek ? '' : 'font-medium text-amber-600'
          }`}
        >
          {weekLabel(monday)}
          <span className="sr-only">{isThisWeek ? ' (this week)' : ' (not this week)'}</span>
        </span>
        <Link
          href={`/meals?week=${shiftWeek(monday, 1)}`}
          aria-label="Next week"
          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm leading-none dark:border-neutral-700"
        >
          →
        </Link>
        {!isThisWeek && (
          <Link
            href="/meals"
            className="whitespace-nowrap rounded-lg border border-amber-600 px-2 py-1 text-xs leading-none text-amber-600"
          >
            This week
          </Link>
        )}
      </nav>

      <p className="mt-3 text-center text-xs text-neutral-500">
        {summary}
      </p>

      {active.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700">
          No recipes yet — add one below and it appears in every slot. You can
          already plan Eating out.
        </p>
      )}

      <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
        {days.map((day) => {
          const isPast = day < today
          return (
            <li key={day} className="py-3">
              <p
                className={`text-sm ${
                  day === today ? 'font-semibold' : 'font-medium'
                } ${isPast ? 'text-neutral-500' : ''}`}
              >
                {dayLabel(day)}
                {day === today && <span className="ml-2 text-xs font-normal text-neutral-500">today</span>}
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {SLOTS.map(({ slot, label }) => {
                  const meal = mealAt.get(`${day}|${slot}`)
                  return (
                    <div key={slot}>
                      <p className="text-xs text-neutral-500">{label}</p>
                      {isPast ? (
                        <Recorded
                          day={day}
                          slot={slot}
                          label={label}
                          meal={meal}
                          choices={choices}
                          name={name}
                        />
                      ) : (
                        <form action={setMeal} className="mt-1">
                          <input type="hidden" name="day" value={day} />
                          <input type="hidden" name="slot" value={slot} />
                          <input type="hidden" name="field" value="planned" />
                          <AutoSubmitSelect
                            // Keyed on the value so a server-side change (Copy
                            // last week) remounts the uncontrolled select.
                            key={toValue(meal?.planned_kind ?? null, meal?.planned_recipe_id ?? null)}
                            name="value"
                            aria-label={`${label}, ${dayLabel(day)}`}
                            defaultValue={toValue(
                              meal?.planned_kind ?? null,
                              meal?.planned_recipe_id ?? null,
                            )}
                            className={selectClass}
                          >
                            <option value="">Not planned</option>
                            <option value="eating_out">{EATING_OUT}</option>
                            <RecipeOptions recipes={choices} />
                          </AutoSubmitSelect>
                        </form>
                      )}
                    </div>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Fills gaps only — never overwrites a slot that already has a plan. */}
      <form action={copyLastWeek} className="mt-4">
        <input type="hidden" name="week" value={monday} />
        <button
          type="submit"
          className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium dark:border-neutral-700"
        >
          Copy last week into empty slots
        </button>
      </form>

      <section id="recipes" className="mt-12">
        <h2 className="text-sm font-medium">Recipes</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {active.length === 1 ? '1 recipe' : `${active.length} recipes`} to plan with
        </p>

        {groupByType(active).map((group) => (
          <div key={group.label} className="mt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {group.label}
            </h3>
            <ul className="mt-1 divide-y divide-neutral-200 dark:divide-neutral-800">
              {group.recipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} />
              ))}
            </ul>
          </div>
        ))}

        <details className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-medium">Add a recipe</summary>
          <div className="mt-4">
            <RecipeForm week={monday} />
          </div>
        </details>

        {archived.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-neutral-500">
              Archived ({archived.length})
            </summary>
            <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
              {archived.map((recipe) => (
                <li key={recipe.id} className="flex items-center gap-3 py-3">
                  <p className="min-w-0 flex-1 truncate text-sm">{recipe.title}</p>
                  <ToggleButton recipe={recipe} label="Restore" />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-neutral-500">
              Archived recipes stay on past weeks but are no longer offered.
            </p>
          </details>
        )}
      </section>
    </>
  )
}

const selectClass =
  'w-full rounded-lg border border-neutral-300 bg-transparent px-2.5 py-2 text-sm dark:border-neutral-700'

/** Recipes as <optgroup>s by type, so a long list stays scannable. */
function RecipeOptions({ recipes }: { recipes: Recipe[] }) {
  return groupByType(recipes).map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.recipes.map((r) => (
        <option key={r.id} value={`recipe:${r.id}`}>
          {r.title}
        </option>
      ))}
    </optgroup>
  ))
}

/**
 * A slot on a day that has passed.
 *
 * Unrecorded with a plan: the plan, a one-tap "✓ as planned", and a select
 * for when it went differently. Recorded: what happened, still changeable,
 * with the plan beside it when the two differ.
 */
function Recorded({
  day,
  slot,
  label,
  meal,
  choices,
  name,
}: {
  day: string
  slot: MealSlot
  label: string
  meal: Meal | undefined
  choices: Recipe[]
  name: (kind: MealKind | null, recipeId: string | null) => string
}) {
  const planned = meal?.planned_kind ?? null
  const actual = meal?.actual_kind ?? null
  const hidden = (
    <>
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="field" value="actual" />
    </>
  )

  if (actual !== null) {
    const differs =
      planned !== null &&
      (planned !== actual || meal?.planned_recipe_id !== meal?.actual_recipe_id)
    const value = toValue(actual, meal?.actual_recipe_id ?? null)
    return (
      <form action={setMeal} className="mt-1">
        {hidden}
        <AutoSubmitSelect
          key={value}
          name="value"
          aria-label={`What you had for ${label}, ${dayLabel(day)}`}
          defaultValue={value}
          className={selectClass}
        >
          <option value="">Not recorded</option>
          <option value="eating_out">{EATING_OUT}</option>
          <RecipeOptions recipes={choices} />
        </AutoSubmitSelect>
        {differs && (
          <p className="mt-1 text-xs text-amber-600">
            Planned: {name(planned, meal?.planned_recipe_id ?? null)}
          </p>
        )}
        {planned === null && (
          <p className="mt-1 text-xs text-neutral-500">Wasn&rsquo;t planned</p>
        )}
      </form>
    )
  }

  return (
    <div className="mt-1">
      {planned !== null && (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {name(planned, meal?.planned_recipe_id ?? null)}
          </span>
          <form action={setMeal}>
            {hidden}
            <button
              type="submit"
              name="value"
              value="as_planned"
              className="whitespace-nowrap rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium dark:border-neutral-700"
            >
              ✓ as planned
            </button>
          </form>
        </div>
      )}
      <form action={setMeal} className={planned !== null ? 'mt-1.5' : ''}>
        {hidden}
        <AutoSubmitSelect
          skipEmpty
          name="value"
          aria-label={`What you had for ${label}, ${dayLabel(day)}`}
          defaultValue=""
          className={`${selectClass} text-neutral-500`}
        >
          <option value="">{planned !== null ? 'Something else…' : 'What did you have?'}</option>
          <option value="eating_out">{EATING_OUT}</option>
          <RecipeOptions recipes={choices} />
        </AutoSubmitSelect>
      </form>
    </div>
  )
}

/**
 * One line under the navigator.
 *
 * Planned counts the whole week; the rest only counts days that have passed,
 * because nothing can have happened "as planned" on Thursday yet.
 */
function summarise(meals: Meal[], days: string[], today: string): string {
  const slots = days.length * SLOTS.length
  const planned = meals.filter((m) => m.planned_kind !== null).length
  const past = meals.filter((m) => m.day < today)

  const asPlanned = past.filter(
    (m) =>
      m.actual_kind !== null &&
      m.actual_kind === m.planned_kind &&
      m.actual_recipe_id === m.planned_recipe_id,
  ).length
  const ateOut = past.filter((m) => m.actual_kind === 'eating_out').length
  const unplannedOut = past.filter(
    (m) => m.actual_kind === 'eating_out' && m.planned_kind !== 'eating_out',
  ).length
  const unrecorded = past.filter(
    (m) => m.planned_kind !== null && m.actual_kind === null,
  ).length

  const parts = [`Planned ${planned}/${slots}`]
  if (past.length > 0) {
    parts.push(`as planned ${asPlanned}`)
    parts.push(
      unplannedOut > 0 ? `ate out ${ateOut} (${unplannedOut} unplanned)` : `ate out ${ateOut}`,
    )
    if (unrecorded > 0) parts.push(`${unrecorded} not recorded`)
  }
  return parts.join(' · ')
}

function RecipeRow({ recipe }: { recipe: Recipe }) {
  const ingredients = (recipe.ingredients ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const hasDetail = ingredients.length > 0 || recipe.method

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{recipe.title}</p>
        <EditDialog action={updateRecipe} id={recipe.id} title={recipe.title}>
          <Field label="Title">
            <input name="title" type="text" required defaultValue={recipe.title} className={fieldClass} />
          </Field>
          <Field label="Type">
            <RecipeTypeSelect defaultValue={recipe.recipe_type} />
          </Field>
          <Field label="Ingredients (one per line)">
            <textarea
              name="ingredients"
              rows={5}
              defaultValue={recipe.ingredients ?? ''}
              className={fieldClass}
            />
          </Field>
          <Field label="Method">
            <textarea name="method" rows={5} defaultValue={recipe.method ?? ''} className={fieldClass} />
          </Field>
        </EditDialog>
        <ToggleButton recipe={recipe} label="Archive" />
      </div>

      {hasDetail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-neutral-500">
            {ingredients.length > 0
              ? `${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'}`
              : 'Method'}
          </summary>
          {ingredients.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {ingredients.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {recipe.method && (
            <p className="mt-2 whitespace-pre-line text-sm">{recipe.method}</p>
          )}
        </details>
      )}
    </li>
  )
}

function ToggleButton({ recipe, label }: { recipe: Recipe; label: string }) {
  return (
    <form action={toggleRecipe}>
      <input type="hidden" name="id" value={recipe.id} />
      <input type="hidden" name="active" value={String(recipe.active)} />
      <button
        type="submit"
        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
      >
        {label}
      </button>
    </form>
  )
}
