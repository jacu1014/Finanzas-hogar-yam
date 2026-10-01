create table public.household_budget_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  category text not null default 'Otros',
  planned_amount numeric(14, 2) not null check (planned_amount > 0),
  due_day smallint check (due_day between 1 and 31),
  created_at timestamptz not null default now()
);

create index household_budget_items_household_idx
  on public.household_budget_items (household_id, created_at);

alter table public.household_budget_items enable row level security;

grant select, insert, update, delete on public.household_budget_items to authenticated;

create policy "Household members can view planned payments" on public.household_budget_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "Household members can add planned payments" on public.household_budget_items
  for insert to authenticated with check (
    public.is_household_member(household_id)
    and created_by = (select auth.uid())
  );
create policy "Household members can update planned payments" on public.household_budget_items
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Household members can remove planned payments" on public.household_budget_items
  for delete to authenticated using (public.is_household_member(household_id));

create or replace function public.refresh_household_monthly_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.households
    set monthly_budget = coalesce((
      select sum(item.planned_amount)
      from public.household_budget_items as item
      where item.household_id = old.household_id
    ), 0)
    where id = old.household_id;
    return old;
  end if;

  update public.households
  set monthly_budget = coalesce((
    select sum(item.planned_amount)
    from public.household_budget_items as item
    where item.household_id = new.household_id
  ), 0)
  where id = new.household_id;

  if tg_op = 'UPDATE' and old.household_id <> new.household_id then
    update public.households
    set monthly_budget = coalesce((
      select sum(item.planned_amount)
      from public.household_budget_items as item
      where item.household_id = old.household_id
    ), 0)
    where id = old.household_id;
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_household_monthly_budget() from public, anon, authenticated;

create trigger household_budget_items_refresh_total
  after insert or update or delete on public.household_budget_items
  for each row execute function public.refresh_household_monthly_budget();

insert into public.household_budget_items (household_id, created_by, name, category, planned_amount)
select household.id, household.created_by, 'Presupuesto inicial', 'Otros', household.monthly_budget
from public.households as household
where coalesce(household.monthly_budget, 0) > 0
  and not exists (
    select 1
    from public.household_budget_items as item
    where item.household_id = household.id
  );

update public.households as household
set monthly_budget = coalesce((
  select sum(item.planned_amount)
  from public.household_budget_items as item
  where item.household_id = household.id
), 0);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'household_budget_items'
    ) then
    alter publication supabase_realtime add table public.household_budget_items;
  end if;
end;
$$;
