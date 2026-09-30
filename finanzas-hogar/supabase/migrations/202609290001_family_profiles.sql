alter table public.households
  add column monthly_budget numeric(14, 2) check (monthly_budget is null or monthly_budget >= 0);

drop policy "Members can view their households" on public.households;
create policy "Members and owners can view their households" on public.households
  for select to authenticated using (
    public.is_household_member(id)
    or created_by = (select auth.uid())
  );

create table public.household_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  relationship text not null default 'Familiar',
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

alter table public.transactions
  add column person_id uuid;

alter table public.transactions
  add constraint transactions_household_person_fk
  foreign key (household_id, person_id)
  references public.household_people(household_id, id)
  on delete set null (person_id);

create index household_people_household_idx on public.household_people (household_id, created_at);
create index transactions_person_idx on public.transactions (person_id);

alter table public.household_people enable row level security;

create policy "Household members can view family profiles" on public.household_people
  for select to authenticated using (public.is_household_member(household_id));
create policy "Household members can add family profiles" on public.household_people
  for insert to authenticated with check (
    public.is_household_member(household_id)
    and created_by = (select auth.uid())
  );
create policy "Household members can update family profiles" on public.household_people
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Household members can remove family profiles" on public.household_people
  for delete to authenticated using (public.is_household_member(household_id));
