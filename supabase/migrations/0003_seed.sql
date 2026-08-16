-- 0003_seed.sql — the starting category taxonomy
--
-- All of this is renameable, reorderable, extendable and archivable in
-- Settings afterwards. It is a starting point, not a fixed schema.
--
-- Roughly 25 categories with a Misc escape hatch: past about this size people
-- stop categorising honestly at the moment of entry, and an entry you cannot
-- file is an entry you do not make. A Misc that grows is a signal to add a
-- category, not a failure.
--
-- Guarded so re-running the migration is a no-op rather than a duplicate.

do $$
begin
  if exists (select 1 from category_groups) then
    raise notice '0003_seed: category_groups already populated, skipping seed';
    return;
  end if;

  -- Groups -------------------------------------------------------------------
  -- `committed` is the monthly floor: summed, it is the number that must be
  -- earned before anything else. `transfer` is money moved, not money burnt.
  insert into category_groups (name, kind, sort_order) values
    ('Committed',  'committed', 1),
    ('Essentials', 'variable',  2),
    ('Lifestyle',  'variable',  3),
    ('Personal',   'variable',  4),
    ('Savings',    'transfer',  5),
    ('Other',      'variable',  6);

  -- Categories ---------------------------------------------------------------
  insert into categories (group_id, name, icon, sort_order)
  select g.id, c.name, c.icon, c.sort_order
  from category_groups g
  join (values
    -- Committed — contractual, mostly filled in by recurring rules.
    ('Committed', 'Rent / Warmmiete',        '🏠', 1),
    ('Committed', 'Utilities',               '💡', 2),
    ('Committed', 'Internet & mobile',       '📶', 3),
    ('Committed', 'Insurance',               '🛡️', 4),
    ('Committed', 'Rundfunkbeitrag',         '📻', 5),
    ('Committed', 'Subscriptions',           '🔁', 6),
    ('Committed', 'Loans / EMI',             '🏦', 7),
    -- The regular monthly transfer to India is a fixed commitment and belongs
    -- in the floor. Its occasional counterpart lives under Personal below.
    ('Committed', 'Family support — monthly', '🇮🇳', 8),

    -- Essentials
    ('Essentials', 'Groceries',              '🛒', 1),
    ('Essentials', 'Household & drogerie',   '🧴', 2),
    ('Essentials', 'Transport',              '🚆', 3),
    ('Essentials', 'Health',                 '💊', 4),

    -- Lifestyle — where a budget actually changes behaviour.
    ('Lifestyle', 'Dining out & takeaway',   '🍽️', 1),
    ('Lifestyle', 'Snacks & coffee',         '☕', 2),
    ('Lifestyle', 'Shopping',                '👕', 3),
    ('Lifestyle', 'Entertainment',           '🎬', 4),
    ('Lifestyle', 'Travel & holidays',       '✈️', 5),
    ('Lifestyle', 'Gifts & celebrations',    '🎁', 6),

    -- Personal
    ('Personal', 'Personal care',            '💇', 1),
    ('Personal', 'Education & courses',      '📚', 2),
    -- Unpredictable, so deliberately NOT in the Committed floor. This is a
    -- separate category from the monthly one, not the same category in two
    -- groups — a category has exactly one group_id, which is what guarantees
    -- group totals sum to the month total with nothing counted twice.
    ('Personal', 'Family support — extra',   '🤝', 3),
    ('Personal', 'Fees & admin',             '🧾', 4),

    -- Savings — kind = 'transfer', so excluded from every spend total and from
    -- budget consumption. Unlike family support, this money has not left the
    -- household.
    ('Savings', 'Savings',                   '🐖', 1),
    ('Savings', 'Investments',               '📈', 2),

    -- Other
    ('Other', 'Misc / uncategorised',        '❓', 1)
  ) as c(group_name, name, icon, sort_order)
    on c.group_name = g.name;
end $$;
