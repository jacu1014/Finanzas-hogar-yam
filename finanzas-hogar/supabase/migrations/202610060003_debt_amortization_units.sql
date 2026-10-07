alter table public.debts
  add column currency_unit text not null default 'COP' check (currency_unit in ('COP', 'UVR')),
  add column opened_on date,
  add column uvr_value numeric(14, 6) not null default 1 check (uvr_value > 0);

update public.debts
set opened_on = created_at::date
where opened_on is null;

alter table public.debts
  alter column opened_on set default current_date,
  alter column opened_on set not null;

alter table public.debts
  alter column original_amount type numeric(18, 6),
  alter column opening_balance type numeric(18, 6),
  alter column balance type numeric(18, 6),
  alter column installment_amount type numeric(18, 6);

alter table public.household_debt_payments
  add column principal_units numeric(18, 6),
  add column interest_units numeric(18, 6),
  add column uvr_value numeric(14, 6) not null default 1;

update public.household_debt_payments
set principal_units = principal_amount,
    interest_units = interest_amount
where principal_units is null or interest_units is null;

alter table public.household_debt_payments
  alter column principal_units set not null,
  alter column interest_units set not null;

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
    select sum(payment.principal_units)
    from public.household_debt_payments as payment
    where payment.debt_id = target_debt_id
  ), 0), 0)
  where debt.id = target_debt_id;

  if tg_op = 'UPDATE' and old.debt_id <> new.debt_id then
    update public.debts as debt
    set balance = greatest(debt.opening_balance - coalesce((
      select sum(payment.principal_units)
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

drop function if exists public.record_household_debt_payment(uuid, date, numeric, numeric, boolean, text);

create function public.record_household_debt_payment(
  target_debt_id uuid,
  payment_date date,
  payment_amount numeric,
  interest_paid numeric default null,
  is_installment boolean default true,
  payment_notes text default '',
  payment_uvr_value numeric default null
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
  debt_currency text;
  annual_rate numeric;
  current_debt_balance numeric(18, 6);
  current_uvr_value numeric(14, 6);
  paid_unit_value numeric(14, 6);
  matched_person_id uuid;
  new_payment_id uuid;
  previous_payment_date date;
  accrual_days integer;
  accrued_interest_units numeric(18, 6);
  final_interest_units numeric(18, 6);
  final_interest_amount numeric(14, 2);
  final_principal_amount numeric(14, 2);
  final_principal_units numeric(18, 6);
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para registrar un pago.' using errcode = '28000';
  end if;
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'El valor total pagado en pesos debe ser mayor que cero.' using errcode = '22023';
  end if;
  if interest_paid is not null and (interest_paid < 0 or interest_paid > payment_amount) then
    raise exception 'El interés informado debe estar entre cero y el total pagado.' using errcode = '22023';
  end if;

  select debt.household_id, debt.name, debt.currency_unit, coalesce(debt.interest_rate, 0), debt.balance, debt.uvr_value
  into target_household_id, target_debt_name, debt_currency, annual_rate, current_debt_balance, current_uvr_value
  from public.debts as debt
  where debt.id = target_debt_id
  for update;

  if target_household_id is null or not public.is_household_member(target_household_id) then
    raise exception 'La deuda no existe o no pertenece a uno de tus hogares.' using errcode = '42501';
  end if;

  paid_unit_value := case when debt_currency = 'UVR' then coalesce(payment_uvr_value, current_uvr_value) else 1 end;
  if paid_unit_value is null or paid_unit_value <= 0 then
    raise exception 'Ingresa el valor de la UVR correspondiente a la fecha del pago.' using errcode = '22023';
  end if;

  select max(payment.paid_on) into previous_payment_date
  from public.household_debt_payments as payment
  where payment.debt_id = target_debt_id;
  previous_payment_date := coalesce(previous_payment_date, (select debt.opened_on from public.debts as debt where debt.id = target_debt_id));
  if coalesce(payment_date, current_date) < previous_payment_date then
    raise exception 'La fecha del pago no puede ser anterior al último pago registrado.' using errcode = '22023';
  end if;

  accrual_days := coalesce(payment_date, current_date) - previous_payment_date;
  accrued_interest_units := current_debt_balance * (power(1 + annual_rate / 100, accrual_days::numeric / 365) - 1);
  final_interest_units := case
    when interest_paid is not null then interest_paid / paid_unit_value
    else accrued_interest_units
  end;
  final_interest_amount := round(final_interest_units * paid_unit_value, 2);

  if final_interest_amount > payment_amount then
    raise exception 'El pago no cubre el interés devengado de %; aumenta el valor o registra el interés real del extracto.', round(final_interest_amount, 2) using errcode = '22023';
  end if;

  final_principal_amount := payment_amount - final_interest_amount;
  final_principal_units := final_principal_amount / paid_unit_value;
  if final_principal_units > current_debt_balance then
    raise exception 'El abono a capital supera el saldo pendiente. Registra solo el saldo más el interés.' using errcode = '22023';
  end if;

  insert into public.household_debt_payments (
    debt_id, created_by, paid_on, amount, principal_amount, interest_amount,
    counts_as_installment, notes, principal_units, interest_units, uvr_value
  ) values (
    target_debt_id, current_user_id, coalesce(payment_date, current_date), payment_amount,
    final_principal_amount, final_interest_amount, coalesce(is_installment, true),
    coalesce(payment_notes, ''), final_principal_units, final_interest_units, paid_unit_value
  ) returning id into new_payment_id;

  update public.debts as debt
  set uvr_value = paid_unit_value,
      next_due_date = case when coalesce(is_installment, true) then case debt.payment_frequency
        when 'weekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 7
        when 'biweekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 14
        else (coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + interval '1 month')::date
      end else debt.next_due_date end,
      due_date = case when coalesce(is_installment, true) then case debt.payment_frequency
        when 'weekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 7
        when 'biweekly' then coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + 14
        else (coalesce(debt.next_due_date, coalesce(payment_date, current_date)) + interval '1 month')::date
      end else debt.due_date end
  where debt.id = target_debt_id;

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

revoke all on function public.record_household_debt_payment(uuid, date, numeric, numeric, boolean, text, numeric) from public, anon;
grant execute on function public.record_household_debt_payment(uuid, date, numeric, numeric, boolean, text, numeric) to authenticated;