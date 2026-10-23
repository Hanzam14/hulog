create table public.payout_withdrawals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  cycle_id uuid not null references public.cycles(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  withdrawal_date date not null default public.hulog_today(),
  note text not null default '' check (char_length(note) <= 140),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  check ((voided_at is null) = (voided_by is null))
);

create index payout_withdrawals_cycle_idx on public.payout_withdrawals(cycle_id, withdrawal_date, created_at);
alter table public.payout_withdrawals enable row level security;
create policy read_payout_withdrawals on public.payout_withdrawals
  for select to authenticated using (group_id = private.active_group());
revoke all on public.payout_withdrawals from public, anon, authenticated;
grant select on public.payout_withdrawals to authenticated;

create trigger audit_payout_withdrawals after insert or update on public.payout_withdrawals
  for each row execute function private.audit();

create function public.record_payout_withdrawal(
  p_cycle_id uuid,
  p_amount_centavos numeric,
  p_note text default '',
  p_withdrawal_date date default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c cycles := private.lock_cycle(p_cycle_id);
  holder uuid;
  pot bigint;
  withdrawn bigint;
  entry_id uuid;
  note_value text := coalesce(p_note, '');
  entry_date date := coalesce(p_withdrawal_date, public.hulog_today());
begin
  select w.holder_id into holder from wallets w where w.id = c.wallet_id;
  if c.status <> 'accepted' or public.hulog_today() <= c.end_date or c.received_at is not null then
    raise exception 'Only an unreceived completed cycle can record a withdrawal';
  end if;
  if holder is null or holder = c.receiver_id
     or auth.uid() not in (holder, c.receiver_id)
     or not exists (select 1 from memberships m where m.group_id = c.group_id and m.user_id = holder and m.status = 'active')
     or not exists (select 1 from memberships m where m.group_id = c.group_id and m.user_id = c.receiver_id and m.status = 'active') then
    raise exception 'Only the active holder or receiver can record this withdrawal';
  end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 or p_amount_centavos <> trunc(p_amount_centavos) then
    raise exception 'Withdrawal amount must be a positive integer number of centavos';
  end if;
  if char_length(note_value) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
  if entry_date > public.hulog_today() then raise exception 'Withdrawal date cannot be in the future'; end if;
  if entry_date < c.start_date then raise exception 'Withdrawal date cannot be before the cycle start date'; end if;

  select coalesce(sum(p.amount_centavos), 0)::bigint into pot
    from payments p where p.cycle_id = c.id and p.status = 'confirmed' and p.deleted_at is null;
  select coalesce(sum(pw.amount_centavos), 0)::bigint into withdrawn
    from payout_withdrawals pw where pw.cycle_id = c.id and pw.voided_at is null;
  if p_amount_centavos > greatest(0, pot - withdrawn) then
    raise exception 'Withdrawal exceeds the remaining held amount';
  end if;

  insert into payout_withdrawals(group_id, cycle_id, amount_centavos, withdrawal_date, note, created_by)
  values (c.group_id, c.id, p_amount_centavos::bigint, entry_date, note_value, auth.uid())
  returning id into entry_id;
  return entry_id;
end $$;

create function public.void_payout_withdrawal(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  withdrawal payout_withdrawals;
  c cycles;
  holder uuid;
begin
  select * into withdrawal from payout_withdrawals pw
    where pw.id = p_id and pw.group_id = private.require_group();
  if not found then raise exception 'Withdrawal not in your group'; end if;
  c := private.lock_cycle(withdrawal.cycle_id);
  select w.holder_id into holder from wallets w where w.id = c.wallet_id;
  if auth.uid() not in (holder, c.receiver_id) then
    raise exception 'Only the active holder or receiver can correct this withdrawal';
  end if;
  if c.received_at is not null then
    raise exception 'Withdrawal cannot be corrected after the remaining payout is acknowledged';
  end if;
  select * into withdrawal from payout_withdrawals pw where pw.id = p_id for update;
  if withdrawal.voided_at is not null then raise exception 'Withdrawal is already voided'; end if;
  update payout_withdrawals set voided_at = now(), voided_by = auth.uid() where id = p_id;
end $$;

create or replace view public.cycle_summary with (security_invoker = true) as
select
  c.id,
  c.group_id,
  c.daily_amount_centavos,
  c.num_days,
  c.start_date,
  c.end_date,
  c.receiver_id,
  c.proposed_by,
  c.status,
  c.accepted_by,
  c.accepted_at,
  c.received_at,
  c.created_at,
  c.wallet_id,
  c.pending_wallet_id,
  c.wallet_proposed_by,
  case
    when c.status <> 'accepted' then c.status
    when public.hulog_today() < c.start_date then 'upcoming'
    when public.hulog_today() <= c.end_date then 'open'
    when public.hulog_today() = c.end_date + 1 then 'settling'
    else 'ended'
  end as phase,
  coalesce((select sum(p.amount_centavos) from public.payments p where p.cycle_id = c.id and p.status = 'confirmed' and p.deleted_at is null), 0)::bigint as pot_centavos,
  (c.daily_amount_centavos * c.num_days * 2)::bigint as target_centavos,
  case
    when c.status <> 'accepted' or public.hulog_today() <= c.end_date then null
    when c.receiver_id = w.holder_id or c.received_at is not null
      or (coalesce((select sum(pw.amount_centavos) from public.payout_withdrawals pw where pw.cycle_id = c.id and pw.voided_at is null), 0)
          >= coalesce((select sum(p.amount_centavos) from public.payments p where p.cycle_id = c.id and p.status = 'confirmed' and p.deleted_at is null), 0)
          and coalesce((select sum(p.amount_centavos) from public.payments p where p.cycle_id = c.id and p.status = 'confirmed' and p.deleted_at is null), 0) > 0) then 'Received'
    else 'Waiting for Got it'
  end as payout_state,
  greatest(0, c.end_date - public.hulog_today() + 1)::integer as days_left,
  w.holder_id as holder_id,
  w.label as wallet_label,
  coalesce((select sum(pw.amount_centavos) from public.payout_withdrawals pw where pw.cycle_id = c.id and pw.voided_at is null), 0)::bigint as withdrawn_centavos,
    case when c.received_at is not null or (public.hulog_today() > c.end_date and c.receiver_id = w.holder_id) then 0 else greatest(0,
    coalesce((select sum(p.amount_centavos) from public.payments p where p.cycle_id = c.id and p.status = 'confirmed' and p.deleted_at is null), 0)
    - coalesce((select sum(pw.amount_centavos) from public.payout_withdrawals pw where pw.cycle_id = c.id and pw.voided_at is null), 0)
    ) end::bigint as held_centavos
from public.cycles c
join public.wallets w on w.id = c.wallet_id;

create or replace view public.custody_summary with (security_invoker = true) as
select
  w.id as wallet_id,
  w.group_id,
  w.holder_id,
  w.label,
  w.archived_at,
  exists(select 1 from public.memberships m where m.group_id = w.group_id and m.user_id = w.holder_id and m.status = 'active') as holder_active,
  coalesce((select sum(cs.held_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0)::bigint as paluwagan_centavos,
  coalesce((select sum(gs.saved_centavos) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0)::bigint as ipon_centavos,
  (coalesce((select sum(cs.held_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0) + coalesce((select sum(gs.saved_centavos) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0))::bigint as total_centavos
from public.wallets w;

revoke all on public.cycle_summary, public.custody_summary from public, anon, authenticated;
grant select on public.cycle_summary, public.custody_summary to authenticated;
revoke execute on function public.record_payout_withdrawal(uuid, numeric, text, date) from public, anon, authenticated;
revoke execute on function public.void_payout_withdrawal(uuid) from public, anon, authenticated;
grant execute on function public.record_payout_withdrawal(uuid, numeric, text, date) to authenticated;
grant execute on function public.void_payout_withdrawal(uuid) to authenticated;
grant select on public.cycle_summary, public.custody_summary to authenticated;
