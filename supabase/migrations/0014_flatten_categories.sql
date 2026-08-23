-- 0014_flatten_categories.sql — one flat list of categories, budgets on them
--
-- `category_groups` was the last piece of the two-level taxonomy. 0011 already
-- removed the meaning it carried (`kind`), leaving it as a pure folder — but a
-- folder still forces every screen to answer "at which level?" twice, and the
-- answers disagreed in a way that read as a bug:
--
--   Plan showed "Recurring 2.482,02" (every rule, whatever folder) directly
--   above "Committed 2.670,53 / 2.982,02" (this cycle's spend in one folder).
--   Both were correct. Neither was comparable to the other. The €188,51 gap
--   was two folder-membership differences and €482,70 of hand-entered spend.
--
-- Worse, the surviving folder was still NAMED "Committed" — the exact label
-- 0011 set out to destroy, one heading away from the concept that replaced it.
--
-- After this migration there is ONE level. A category may carry:
--
--   a recurring rule — it goes out every month regardless
--   a budget         — a target you might miss
--
-- Either, both, or neither, exactly as before. The two stay independent; what
-- goes away is the third thing that was neither, and the question of which
-- level "over" is measured at. A category budget now simply IS the budget.
--
-- Group-scoped budgets are deleted rather than redistributed: splitting one
-- group figure across its categories would invent numbers nobody chose. The
-- four that existed (Committed 2.982,02 · Essentials 700 · Lifestyle 200 ·
-- Personal 700) are re-entered by hand at category level. No expense is
-- touched — deleting a budget never deletes the spending it measured.

-- Category sort_order was only ever unique WITHIN a group; flattened, the
-- groups' 1,2,3… collide. Re-sequence globally first, preserving what the
-- picker looked like: group order, then position inside the group.
with ordered as (
  select c.id,
         row_number() over (order by g.sort_order, c.sort_order, c.name) as rn
  from categories c
  join category_groups g on g.id = c.group_id
)
update categories c
   set sort_order = ordered.rn
  from ordered
 where ordered.id = c.id;

-- Budgets -------------------------------------------------------------------
delete from budgets where scope = 'group';

drop index if exists budgets_wallet_group_idx;

alter table budgets drop constraint if exists budgets_scope_check;
alter table budgets drop constraint if exists budgets_scope_target_matches;
alter table budgets drop column group_id;

alter table budgets add constraint budgets_scope_check
  check (scope in ('wallet', 'category'));

-- `wallet` is the personal-wallet case: one number for the whole wallet, no
-- breakdown. `category` is everything else.
alter table budgets add constraint budgets_scope_target_matches check (
  (scope = 'wallet'   and category_id is null) or
  (scope = 'category' and category_id is not null)
);

-- Categories ----------------------------------------------------------------
drop index if exists categories_group_id_idx;
alter table categories drop column group_id;

-- Policies drop with the table.
drop table category_groups;
