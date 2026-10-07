create or replace function public.is_shopping_list_member(target_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shopping_lists as lists
    join public.household_members as members on members.household_id = lists.household_id
    where lists.id = target_list
      and members.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_shopping_list_member(uuid) from public;
grant execute on function public.is_shopping_list_member(uuid) to authenticated;

drop policy if exists "Household members can manage shopping list items" on public.shopping_list_items;
create policy "Household members can manage shopping list items" on public.shopping_list_items
  for all to authenticated
  using (public.is_shopping_list_member(list_id))
  with check (public.is_shopping_list_member(list_id));