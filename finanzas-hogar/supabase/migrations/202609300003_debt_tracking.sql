alter table public.debts
  add column opening_balance numeric(14, 2),
  add column total_installments integer check (total_installments is null or total_installments > 0),
  add column installment_amount numeric(14, 2) check (installment_amount is null or installment_amount > 0),
  add column payment_frequency text not null default 'monthly' check (payment_frequency in ('weekly', 'biweekly', 'monthly')),
  add column next_due_date date;

update public.debts
set opening_balance = balance,
    next_due_date = due_date
where opening_balance is null;

alter table public.debts
  alter column opening_balance set not null,
  alter column opening_balance set default 0;

create table public.household_debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  paid_on date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  principal_amount numeric(14, 2) not null check (principal_amount >= 0),
  interest_amount numeric(14, 2) not null default 0 check (interest_amount >= 0),
  counts_as_installment boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (amount = principal_amount + interest_amount)
);

create index household_debt_payments_debt_date_idx
  on public.household_debt_payments (debt_id, paid_on desc, created_at desc);

alter table public.household_debt_payments enable row level security;

grant select on public.household_debt_payments to authenticated;

grant select, insert, update, delete on public.debts to authenticated;

create policy "Household members can view debt payments" on public.household_debt_payments
  for select to authenticated using (
    exists (
      select 1 from public.debts
      where id = debt_id and public.is_household_member(household_id)
    )
  );

create or replace function public.refresh_debt_balance_from_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_debt_id uuid;
begin
  target_debt_id := case when tg_op = 'DELETE' then old.debt_id else new.debt_id end;

  update public.debts as debt
  set balance = greatest(debt.opening_balance - coalesce((
    select sum(payment.principal_amount)
    from public.household_debt_payments as payment
    where payment.debt_id = target_debt_id
  ), 0), 0)
  where debt.id = target_debt_id;

  if tg_op = 'UPDATE' and old.debt_id <> new.debt_id then
    update public.debts as debt
    set balance = greatest(debt.opening_balance - coalesce((
      select sum(payment.principal_amount)
      from public.household_debt_payments as payment
      where payment.debt_id = old.debt_id
    ), 0), 0)
    where debt.id = old.debt_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_debt_balance_from_payments() from public, anon, authenticated;

create trigger household_debt_payments_refresh_balance
  after insert or update or delete on public.household_debt_payments
  for each row execute function public.refresh_debt_balance_from_payments();

create or replace function public.record_household_debt_payment(
  target_debt_id uuid,
  payment_date date,
  payment_amount numeric,
  interest_paid numeric default 0,
  is_installment boolean default true,
  payment_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_household_id uuid;
  target_debt_name text;
  current_debt_balance numeric(14, 2);
  matched_person_id uuid;
  new_payment_id uuid;
  principal_paid numeric(14, 2);
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para registrar un pago.' using errcode = '28000';
  end if;
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'El valor del pago debe ser mayor que cero.' using errcode = '22023';
  end if;
  if interest_paid is null or interest_paid < 0 or interest_paid > payment_amount then
    raise exception 'El interés debe estar entre cero y el total pagado.' using errcode = '22023';
  end if;

  select debt.household_id, debt.name, debt.balance
  into target_household_id, target_debt_name, current_debt_balance
  from public.debts as debt
  where debt.id = target_debt_id
  for update;

  if target_household_id is null or not public.is_household_member(target_household_id) then
    raise exception 'La deuda no existe o no pertenece a uno de tus hogares.' using errcode = '42501';
  end if;

  principal_paid := payment_amount - interest_paid;
  if principal_paid > current_debt_balance then
    raise exception 'El abono a capital no puede superar el saldo pendiente.' using errcode = '22023';
  end if;

  insert into public.household_debt_payments (
    debt_id, created_by, paid_on, amount, principal_amount, interest_amount, counts_as_installment, notes
  ) values (
    target_debt_id, current_user_id, coalesce(payment_date, current_date), payment_amount,
    principal_paid, interest_paid, coalesce(is_installment, true), coalesce(payment_notes, '')
  ) returning id into new_payment_id;

  if coalesce(is_installment, true) then
    update public.debts as debt
    set next_due_date = case debt.payment_frequency
      when 'weekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 7
      when 'biweekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 14
      else (coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + interval '1 month')::date
    end,
    due_date = case debt.payment_frequency
      when 'weekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 7
      when 'biweekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 14
      else (coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + interval '1 month')::date
    end
    where debt.id = target_debt_id;
  end if;

  select person.id into matched_person_id
  from public.household_people as person
  where person.household_id = target_household_id
    and person.user_id = current_user_id
  limit 1;

  insert into public.transactions (
    household_id, member_id, created_by, kind, description, category, amount, occurred_on, person_id
  ) values (
    target_household_id, null, current_user_id, 'expense', 'Pago de deuda: ' || target_debt_name,
    'Deudas', payment_amount, coalesce(payment_date, current_date), matched_person_id
  );

  return new_payment_id;
end;
$$;

revoke all on function public.record_household_debt_payment(uuid, date, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.record_household_debt_payment(uuid, date, numeric, numeric, boolean, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'household_debt_payments'
    ) then
      alter publication supabase_realtime add table public.household_debt_payments;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'debts'
    ) then
      alter publication supabase_realtime add table public.debts;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'transactions'
    ) then
      alter publication supabase_realtime add table public.transactions;
    end if;
  end if;
end;
$$;
