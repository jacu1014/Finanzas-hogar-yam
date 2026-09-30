grant usage on schema public to authenticated;

grant select, insert, update on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.debts to authenticated;
grant select, insert, update, delete on public.market_purchases to authenticated;
grant select, insert, update, delete on public.market_purchase_items to authenticated;
grant select, insert, update, delete on public.shopping_lists to authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
grant select, insert, update, delete on public.household_people to authenticated;
