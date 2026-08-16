-- 0009_donation_category.sql — add Donation
--
-- Placed under Committed because it was described as recurring: Committed is
-- the monthly floor, the group recurring rules mostly attach to. If donations
-- turn out to be occasional rather than fixed, move it to Personal — a
-- category carries a stable UUID, so moving or renaming it never breaks
-- historical expenses.
--
-- Note this only creates the CATEGORY. The recurring rule itself (amount and
-- day of month) is separate, and needs those two values.

insert into categories (group_id, name, icon, sort_order)
select g.id, 'Donation', '🤲', 9
from category_groups g
where g.name = 'Committed'
  and not exists (
    select 1 from categories c where c.name = 'Donation' and c.group_id = g.id
  );
