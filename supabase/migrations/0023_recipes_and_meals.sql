-- 0023_recipes_and_meals.sql — recipes, a weekly meal plan, and what actually
-- happened
--
-- The household's biggest controllable spend is food, and the expensive meal is
-- the unplanned one: nothing in the fridge on a Wednesday becomes a takeaway.
-- So the Meals tab plans a Monday–Sunday week, two meals a day (brunch and
-- dinner), from a list of recipes — and then records what really happened.
--
-- NO MONEY HERE, DELIBERATELY. Neither table references `expenses`, a category
-- or a budget, and a recipe carries no price. The link to the budget is
-- behavioural — a planned week is a week with less eating out — not
-- arithmetic. A cost per recipe would be a guess that goes stale with every
-- price change, and a second, competing answer to what the Groceries budget
-- already says. Eating out is recorded as a KIND of meal, not as an amount; the
-- money still arrives through /add like every other expense.
--
-- PLANNED AND ACTUAL LIVE ON THE SAME ROW. One row per (day, slot), written only
-- once something is set — an empty slot has no row. The plan is
-- planned_kind/planned_recipe_id; what happened is actual_kind/actual_recipe_id.
--
-- "AS PLANNED" IS A COPY, NOT A FLAG. Ticking ✓ writes the planned values into
-- the actual columns. A boolean would re-read the plan, so editing the plan
-- afterwards would silently rewrite history; the copy stays true. "As planned"
-- is therefore computed — actual = planned — and never stored.
--
-- SHARED, LIKE INCOME. The kitchen is shared, so the app always writes into the
-- JOINT wallet (see addRecipe) and both people read every row through the
-- ordinary membership policy. The wallet_id + is_wallet_member() shape is kept
-- because every table has it (PROJECT.md § Add a table).

create table recipes (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references wallets (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  -- Free text, ONE INGREDIENT PER LINE. Not a child table: nobody wants to fill
  -- in quantity/unit/name triples to save a recipe. Lines are enough to build a
  -- shopping list later without changing this column.
  ingredients  text,
  method       text,
  -- Required, a fixed list. It groups the meal-slot dropdowns and the recipe
  -- list, and every recipe sits in one of the three — there is no "Other".
  -- Keys, not labels, so a label can be reworded without a migration; adding a
  -- fourth type does need one.
  recipe_type  text not null
               check (recipe_type in ('north_indian', 'south_indian', 'international')),
  -- Never delete, archive. A past week must always resolve its meal names.
  active       boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index recipes_wallet_active_idx on recipes (wallet_id, active);

create trigger recipes_set_updated_at
  before update on recipes
  for each row execute function public.set_updated_at();

create table meals (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references wallets (id) on delete cascade,
  day                date not null,
  slot               text not null check (slot in ('brunch', 'dinner')),
  -- null = not planned.
  planned_kind       text check (planned_kind in ('recipe', 'eating_out')),
  planned_recipe_id  uuid references recipes (id) on delete restrict,
  -- null = not recorded yet.
  actual_kind        text check (actual_kind in ('recipe', 'eating_out')),
  actual_recipe_id   uuid references recipes (id) on delete restrict,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (wallet_id, day, slot),

  -- A recipe meal names its recipe; anything else names none. Written with
  -- coalesce so a null kind is held to "no recipe" too, rather than slipping
  -- through because null = false is null.
  constraint meals_planned_recipe_matches_kind
    check ((coalesce(planned_kind, '') = 'recipe') = (planned_recipe_id is not null)),
  constraint meals_actual_recipe_matches_kind
    check ((coalesce(actual_kind, '') = 'recipe') = (actual_recipe_id is not null))
);

create index meals_planned_recipe_idx on meals (planned_recipe_id);
create index meals_actual_recipe_idx on meals (actual_recipe_id);

create trigger meals_set_updated_at
  before update on meals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — membership decides, nothing else. Same shape as 0018.
-- ---------------------------------------------------------------------------

alter table recipes enable row level security;
alter table meals enable row level security;

grant select, insert, update, delete on recipes to authenticated;
grant select, insert, update, delete on meals to authenticated;

create policy recipes_select on recipes
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy recipes_insert on recipes
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy recipes_update on recipes
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy recipes_delete on recipes
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

create policy meals_select on meals
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy meals_insert on meals
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy meals_update on meals
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy meals_delete on meals
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

-- anon gets nothing, consistent with 0005.
revoke all on recipes from anon;
revoke all on meals from anon;
