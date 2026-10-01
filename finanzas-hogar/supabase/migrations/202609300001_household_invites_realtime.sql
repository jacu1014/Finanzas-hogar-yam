alter table public.households
  add column invite_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

create unique index households_invite_code_idx on public.households (invite_code);

alter table public.household_people
  add column user_id uuid references auth.users(id) on delete set null;

create unique index household_people_user_idx
  on public.household_people (household_id, user_id)
  where user_id is not null;

update public.household_people as person
set user_id = member.user_id
from public.household_members as member
where person.household_id = member.household_id
  and lower(trim(person.name)) = lower(trim(member.display_name))
  and person.user_id is null;

create or replace function public.join_household_by_code(join_code text, member_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_household_id uuid;
  resolved_name text;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para unirte a un hogar.' using errcode = '28000';
  end if;

  select household.id
  into target_household_id
  from public.households as household
  where household.invite_code = upper(trim(join_code));

  if target_household_id is null then
    raise exception 'El código de invitación no existe o ya no está activo.' using errcode = '22023';
  end if;

  resolved_name := coalesce(nullif(trim(member_display_name), ''), nullif((select auth.jwt() -> 'user_metadata' ->> 'display_name'), ''), (select auth.jwt() ->> 'email'), 'Familiar');

  insert into public.household_members (household_id, user_id, display_name, role)
  values (target_household_id, current_user_id, resolved_name, 'member')
  on conflict (household_id, user_id) do update
    set display_name = excluded.display_name;

  update public.household_people
  set user_id = current_user_id,
      name = resolved_name
  where household_id = target_household_id
    and user_id is null
    and lower(trim(name)) = lower(trim(resolved_name));

  insert into public.household_people (household_id, created_by, user_id, name, relationship)
  values (target_household_id, current_user_id, current_user_id, resolved_name, 'Familiar')
  on conflict (household_id, user_id) where user_id is not null do update
    set name = excluded.name;

  return target_household_id;
end;
$$;

revoke all on function public.join_household_by_code(text, text) from public;
grant execute on function public.join_household_by_code(text, text) to authenticated;

grant select, insert, update on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_people to authenticated;

do $$
declare
  v_table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table_name in array array['households', 'household_members', 'household_people', 'transactions', 'debts', 'market_purchases', 'shopping_lists', 'shopping_list_items'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table_name);
      end if;
    end loop;
  end if;
end;
$$;
