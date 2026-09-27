create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency char(3) not null default 'COP',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id),
  unique (household_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid,
  created_by uuid not null references auth.users(id),
  kind text not null check (kind in ('income', 'expense')),
  description text not null,
  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.household_members(household_id, id) on delete set null (member_id)
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  creditor text not null default '',
  original_amount numeric(14, 2) not null check (original_amount > 0),
  balance numeric(14, 2) not null check (balance >= 0),
  interest_rate numeric(7, 4) check (interest_rate >= 0),
  due_date date,
  created_at timestamptz not null default now()
);

create table public.market_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  store text not null default '',
  purchased_on date not null default current_date,
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.market_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.market_purchases(id) on delete cascade,
  name text not null,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text not null default 'unidad',
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(14, 2) not null default 0 check (line_total >= 0)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null default 'Mercado',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  quantity text not null default '',
  is_checked boolean not null default false,
  created_at timestamptz not null default now()
);

create index transactions_household_date_idx on public.transactions (household_id, occurred_on desc);
create index debts_household_idx on public.debts (household_id);
create index market_purchases_household_date_idx on public.market_purchases (household_id, purchased_on desc);
create index market_purchase_items_purchase_idx on public.market_purchase_items (purchase_id);
create index shopping_lists_household_idx on public.shopping_lists (household_id, created_at desc);
create index shopping_list_items_list_idx on public.shopping_list_items (list_id, created_at);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_admin(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household
      and user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.households
    where id = target_household
      and created_by = (select auth.uid())
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_admin(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.market_purchases enable row level security;
alter table public.market_purchase_items enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "Members can view their households" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "Users can create a household" on public.households
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Admins can update their household" on public.households
  for update to authenticated using (public.is_household_admin(id)) with check (public.is_household_admin(id));

create policy "Members can view household members" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "Admins can add members or owners can add themselves" on public.household_members
  for insert to authenticated with check (
    public.is_household_admin(household_id)
    or (
      user_id = (select auth.uid())
      and role = 'admin'
      and public.is_household_owner(household_id)
    )
  );
create policy "Admins can update household members" on public.household_members
  for update to authenticated using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
create policy "Admins can remove household members" on public.household_members
  for delete to authenticated using (public.is_household_admin(household_id));

create policy "Household members can manage transactions" on public.transactions
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Household members can manage debts" on public.debts
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Household members can manage market purchases" on public.market_purchases
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Household members can view purchase items" on public.market_purchase_items
  for select to authenticated using (
    exists (
      select 1 from public.market_purchases
      where id = purchase_id and public.is_household_member(household_id)
    )
  );
create policy "Household members can add purchase items" on public.market_purchase_items
  for insert to authenticated with check (
    exists (
      select 1 from public.market_purchases
      where id = purchase_id and public.is_household_member(household_id)
    )
  );
create policy "Household members can update purchase items" on public.market_purchase_items
  for update to authenticated using (
    exists (
      select 1 from public.market_purchases
      where id = purchase_id and public.is_household_member(household_id)
    )
  ) with check (
    exists (
      select 1 from public.market_purchases
      where id = purchase_id and public.is_household_member(household_id)
    )
  );
create policy "Household members can delete purchase items" on public.market_purchase_items
  for delete to authenticated using (
    exists (
      select 1 from public.market_purchases
      where id = purchase_id and public.is_household_member(household_id)
    )
  );
create policy "Household members can manage shopping lists" on public.shopping_lists
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Household members can manage shopping list items" on public.shopping_list_items
  for all to authenticated using (
    exists (
      select 1 from public.shopping_lists
      where id = list_id and public.is_household_member(household_id)
    )
  ) with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.shopping_lists
      where id = list_id and public.is_household_member(household_id)
    )
  );