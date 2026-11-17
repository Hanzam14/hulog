-- Wishlist "bought with goal money": record the price coming out of the linked
-- shared ipon goal. Hulog still only records money; a spend is evidence that
-- the holder paid for the item from the goal's savings.

create table public.savings_spends (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  goal_id uuid not null references public.savings_goals(id),
  wishlist_item_id uuid references public.wishlist_items(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  spend_date date not null default public.hulog_today(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  check ((voided_at is null) = (voided_by is null))
);

create index savings_spends_goal_idx on public.savings_spends(goal_id) where voided_at is null;
create unique index savings_spends_one_active_per_item on public.savings_spends(wishlist_item_id)
  where voided_at is null and wishlist_item_id is not null;
alter table public.savings_spends enable row level security;
create policy read_savings_spends on public.savings_spends
  for select to authenticated using (group_id = private.active_group());
revoke all on public.savings_spends from public, anon, authenticated;
grant select on public.savings_spends to authenticated;

create trigger audit_savings_spends after insert or update on public.savings_spends
  for each row execute function private.audit();

-- saved_centavos stays the confirmed contributed total (goal progress and
-- completion). spent_centavos is what active spends took out; the money still
-- in the goal is saved minus spent.
create or replace view public.savings_goal_summary with (security_invoker = true) as
select
  g.*,
  w.holder_id,
  w.label as wallet_label,
  coalesce((select sum(amount_centavos) from public.savings_contributions sc where sc.goal_id = g.id and sc.status = 'confirmed' and sc.deleted_at is null), 0)::bigint as saved_centavos,
  case
    when g.status = 'proposed' and public.hulog_today() > g.start_date then 'expired'
    when g.status <> 'accepted' then g.status
    when g.withdrawn_at is not null then 'withdrawn'
    when coalesce((select sum(amount_centavos) from public.savings_contributions sc where sc.goal_id = g.id and sc.status = 'confirmed' and sc.deleted_at is null), 0) >= g.target_amount_centavos then 'completed'
    when public.hulog_today() < g.start_date then 'upcoming'
    when public.hulog_today() <= g.end_date then 'open'
    else 'overdue'
  end as phase,
  greatest(0, g.end_date - public.hulog_today() + 1)::integer as days_left,
  case
    when g.goal_mode = 'matched' and public.hulog_today() >= g.start_date then
      least(g.num_steps, floor((public.hulog_today() - g.start_date)::numeric / g.cadence_days)::integer + 1)
    else 0
  end as expected_steps_today,
  coalesce((select sum(ss.amount_centavos) from public.savings_spends ss where ss.goal_id = g.id and ss.voided_at is null), 0)::bigint as spent_centavos
from public.savings_goals g
join public.wallets w on w.id = g.wallet_id;

create or replace view public.custody_summary with (security_invoker = true) as
select
  w.id as wallet_id,
  w.group_id,
  w.holder_id,
  w.label,
  w.archived_at,
  exists(select 1 from public.memberships m where m.group_id = w.group_id and m.user_id = w.holder_id and m.status = 'active') as holder_active,
  coalesce((select sum(cs.held_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0)::bigint as paluwagan_centavos,
  coalesce((select sum(greatest(0, gs.saved_centavos - gs.spent_centavos)) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0)::bigint as ipon_centavos,
  (coalesce((select sum(cs.held_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0) + coalesce((select sum(greatest(0, gs.saved_centavos - gs.spent_centavos)) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0))::bigint as total_centavos
from public.wallets w;

revoke all on public.savings_goal_summary, public.custody_summary from public, anon, authenticated;
grant select on public.savings_goal_summary, public.custody_summary to authenticated;

-- Replace the two-argument RPC so callers cannot hit an ambiguous overload.
drop function public.set_wishlist_bought(uuid, boolean);

create function public.set_wishlist_bought(p_id uuid, p_bought boolean, p_from_goal boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w wishlist_items := private.lock_wishlist_item(p_id);
  g savings_goals;
  spend savings_spends;
  available bigint;
begin
  if p_bought is null then raise exception 'Bought flag required'; end if;
  if p_from_goal is null then raise exception 'Goal flag required'; end if;
  if (w.status = 'bought') = p_bought then return; end if;

  if p_bought then
    if p_from_goal then
      if w.linked_goal_id is null then raise exception 'Item has no linked goal'; end if;
      select * into g from savings_goals where id = w.linked_goal_id and group_id = w.group_id for update;
      if not found or g.status <> 'accepted' or g.withdrawn_at is not null then
        raise exception 'Goal is not active';
      end if;
      if g.withdraw_proposed_by is not null then raise exception 'Withdrawal in progress'; end if;
      select coalesce((select sum(sc.amount_centavos) from savings_contributions sc
                        where sc.goal_id = g.id and sc.status = 'confirmed' and sc.deleted_at is null), 0)
           - coalesce((select sum(ss.amount_centavos) from savings_spends ss
                        where ss.goal_id = g.id and ss.voided_at is null), 0)
        into available;
      if w.price_centavos > available then raise exception 'Not enough saved in the goal'; end if;
      insert into savings_spends(group_id, goal_id, wishlist_item_id, amount_centavos, created_by)
      values (w.group_id, g.id, w.id, w.price_centavos, auth.uid());
    end if;
    update wishlist_items set status = 'bought', bought_by = auth.uid(), bought_at = now(), updated_at = now() where id = w.id;
  else
    select * into spend from savings_spends ss where ss.wishlist_item_id = w.id and ss.voided_at is null for update;
    if found then
      select * into g from savings_goals where id = spend.goal_id for update;
      if g.withdrawn_at is not null then
        raise exception 'Goal is already withdrawn; the spend cannot be undone';
      end if;
      update savings_spends set voided_at = now(), voided_by = auth.uid() where id = spend.id;
    end if;
    update wishlist_items set status = 'wanted', bought_by = null, bought_at = null, updated_at = now() where id = w.id;
  end if;
end $$;

revoke all on function public.set_wishlist_bought(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_wishlist_bought(uuid, boolean, boolean) to authenticated;
