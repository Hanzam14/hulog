-- Close a fully funded round early (SPEC rule 8a).
-- end_date moves to yesterday so today is the settling day; every existing
-- phase, payment, payout and custody rule then follows unchanged.
alter table public.cycles
  add column planned_end_date date,
  add column closed_early_by uuid references public.profiles,
  add column closed_early_at timestamptz;

create or replace function public.close_cycle_early(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles := private.lock_cycle(p_cycle_id); t date := public.hulog_today(); begin
 if not exists(select 1 from memberships where group_id = c.group_id and user_id = auth.uid() and status = 'active') then
  raise exception 'Active member only';
 end if;
 if c.status <> 'accepted' or c.received_at is not null or t < c.start_date or t > c.end_date then
  raise exception 'Only an open round can close early';
 end if;
 if exists(
  select 1 from memberships m
  where m.group_id = c.group_id and m.status = 'active'
    and coalesce((select sum(p.days) from payments p
                  where p.cycle_id = c.id and p.member_id = m.user_id
                    and p.status = 'confirmed' and p.deleted_at is null), 0) < c.num_days
 ) then
  raise exception 'Pot is not full yet';
 end if;
 update cycles set planned_end_date = c.end_date, closed_early_by = auth.uid(),
  closed_early_at = now(), end_date = t - 1
 where id = c.id;
 -- The existing cycle audit trigger records the actor and the before/after dates.
end $$;

revoke execute on function public.close_cycle_early(uuid) from public, anon;
grant execute on function public.close_cycle_early(uuid) to authenticated;
