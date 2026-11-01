/**
 * Recipe types — the fixed list the `recipes.recipe_type` CHECK in 0023 allows.
 *
 * Its own module, not lib/queries.ts, because the client-side add form needs it
 * and queries.ts is server-only. Order here is display order.
 */
export const RECIPE_TYPES = [
  { key: 'north_indian', label: 'North Indian' },
  { key: 'south_indian', label: 'South Indian' },
  { key: 'international', label: 'International' },
] as const

export type RecipeType = (typeof RECIPE_TYPES)[number]['key']

export function isRecipeType(value: string): value is RecipeType {
  return RECIPE_TYPES.some((t) => t.key === value)
}

/** Recipes grouped by type in RECIPE_TYPES order. Empty groups are dropped. */
export function groupByType<T extends { recipe_type: RecipeType }>(
  recipes: T[],
): { label: string; recipes: T[] }[] {
  return RECIPE_TYPES.map((t) => ({
    label: t.label,
    recipes: recipes.filter((r) => r.recipe_type === t.key),
  })).filter((g) => g.recipes.length > 0)
}
