create table public.household_budget_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create unique index household_budget_categories_name_unique
  on public.household_budget_categories (household_id, lower(trim(name)));
create index household_budget_categories_household_idx
  on public.household_budget_categories (household_id, lower(name));

alter table public.household_budget_categories enable row level security;

grant select, insert on public.household_budget_categories to authenticated;

create policy "Household members can view budget categories" on public.household_budget_categories
  for select to authenticated using (public.is_household_member(household_id));
create policy "Household members can add budget categories" on public.household_budget_categories
  for insert to authenticated with check (
    public.is_household_member(household_id)
    and created_by = (select auth.uid())
  );

insert into public.household_budget_categories (household_id, created_by, name)
select household.id, member.user_id, category.name
from public.households as household
join lateral (
  select household_member.user_id
  from public.household_members as household_member
  where household_member.household_id = household.id
  order by case when household_member.role = 'admin' then 0 else 1 end, household_member.created_at
  limit 1
) as member on true
cross join (values
  ('Vivienda'),
  ('Servicios'),
  ('Alimentación'),
  ('Movilidad'),
  ('Salud'),
  ('Educación'),
  ('Deudas'),
  ('Hogar'),
  ('Otros')
) as category(name);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'household_budget_categories'
    ) then
    alter publication supabase_realtime add table public.household_budget_categories;
  end if;
end;
$$;
