-- Hulog v2 — Couples Financial Companion (Custody, Ipon Goals & Abono Tracker)

-- 1. Tables & Columns
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  holder_id uuid not null references public.profiles(id),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index wallets_active_label_idx on public.wallets(group_id, holder_id, lower(btrim(label))) where archived_at is null;
create index on public.wallets(group_id);

-- Backfill one default wallet for every existing row in public.groups
insert into public.wallets(group_id, holder_id, label, created_by)
select id, owner_id, coalesce(nullif(btrim(pot_location), ''), 'Main Pot'), owner_id from public.groups;

-- Alter public.cycles
alter table public.cycles
  add column wallet_id uuid references public.wallets(id),
  add column pending_wallet_id uuid references public.wallets(id),
  add column wallet_proposed_by uuid references public.profiles(id);

update public.cycles c
set wallet_id = w.id
from public.wallets w
where w.group_id = c.group_id and c.wallet_id is null;

alter table public.cycles alter column wallet_id set not null;

-- Default wallet trigger for raw cycle inserts (backward compatibility)
create or replace function private.cycles_default_wallet() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.wallet_id is null then
    select id into new.wallet_id from public.wallets where group_id = new.group_id and archived_at is null order by created_at asc limit 1;
    if new.wallet_id is null then
      insert into public.wallets(group_id, holder_id, label, created_by)
      select new.group_id, owner_id, coalesce(nullif(btrim(pot_location), ''), 'Main Pot'), owner_id
      from public.groups where id = new.group_id
      returning id into new.wallet_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists set_cycles_default_wallet on public.cycles;
create trigger set_cycles_default_wallet before insert on public.cycles for each row execute function private.cycles_default_wallet();

-- Alter public.payments
alter table public.payments
  add column note text not null default '' check (char_length(note) <= 140);

-- public.savings_goals
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  goal_mode text not null check (goal_mode in ('matched', 'flexible')),
  wallet_id uuid not null references public.wallets(id),
  pending_wallet_id uuid references public.wallets(id),
  wallet_proposed_by uuid references public.profiles(id),
  target_amount_centavos bigint not null check (target_amount_centavos > 0),
  step_amount_centavos bigint,
  cadence_days integer,
  num_steps integer,
  start_date date not null,
  end_date date not null,
  proposed_by uuid not null references public.profiles(id),
  status text not null check (status in ('proposed', 'declined', 'cancelled', 'accepted')),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  withdraw_proposed_by uuid references public.profiles(id),
  withdrawn_by uuid references public.profiles(id),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and (end_date - start_date) <= 1095),
  check (
    (goal_mode = 'matched' and step_amount_centavos between 100 and 1000000000 and cadence_days between 1 and 90 and num_steps between 1 and 366 and target_amount_centavos = step_amount_centavos * num_steps * 2 and end_date = start_date + ((num_steps - 1) * cadence_days))
    or
    (goal_mode = 'flexible' and step_amount_centavos is null and cadence_days is null and num_steps is null and target_amount_centavos between 100 and 10000000000)
  )
);
create index on public.savings_goals(group_id);

-- public.savings_contributions
create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  steps integer check (steps is null or steps >= 1),
  amount_centavos bigint not null check (amount_centavos > 0),
  note text not null default '' check (char_length(note) <= 140),
  status text not null check (status in ('pending', 'confirmed')),
  was_confirmed boolean not null default false,
  created_by uuid not null references public.profiles(id),
  last_edited_by uuid references public.profiles(id),
  delete_proposed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz
);
create index on public.savings_contributions(goal_id, member_id);

-- public.abono_entries
create table public.abono_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null check (kind in ('expense', 'settlement')),
  from_member uuid not null references public.profiles(id),
  to_member uuid not null references public.profiles(id),
  description text not null check (char_length(btrim(description)) between 1 and 80),
  total_amount_centavos bigint not null check (total_amount_centavos > 0),
  owed_amount_centavos bigint not null check (
    owed_amount_centavos > 0
    and owed_amount_centavos <= total_amount_centavos
    and (kind <> 'settlement' or total_amount_centavos = owed_amount_centavos)
  ),
  entry_date date not null,
  note text not null default '' check (char_length(note) <= 140),
  status text not null check (status in ('pending', 'confirmed')),
  was_confirmed boolean not null default false,
  created_by uuid not null references public.profiles(id),
  last_edited_by uuid references public.profiles(id),
  delete_proposed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  check (from_member <> to_member)
);
create index on public.abono_entries(group_id, entry_date);

-- 2. RLS & Audit Trigger
alter table public.wallets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.abono_entries enable row level security;

create policy read_wallets on public.wallets for select to authenticated
  using (group_id = private.active_group());

create policy read_savings_goals on public.savings_goals for select to authenticated
  using (group_id = private.active_group());

create policy read_savings_contributions on public.savings_contributions for select to authenticated
  using (exists (select 1 from public.savings_goals g where g.id = goal_id and g.group_id = private.active_group()));

create policy read_abono_entries on public.abono_entries for select to authenticated
  using (group_id = private.active_group());

create or replace function private.audit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid; b jsonb; a jsonb;
begin
 if TG_OP='UPDATE' and new is not distinct from old then return new; end if;
 if TG_TABLE_NAME='memberships' and TG_OP='UPDATE' and to_jsonb(new)-'last_seen_history_at'=to_jsonb(old)-'last_seen_history_at' then return new; end if;
 if TG_OP<>'INSERT' then b:=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then a:=to_jsonb(new); end if;
 if TG_TABLE_NAME='groups' then g:=coalesce(a,b)->>'id';
 elsif TG_TABLE_NAME in ('payments','repayments') then select group_id into g from cycles where id=(coalesce(a,b)->>'cycle_id')::uuid;
 elsif TG_TABLE_NAME = 'savings_contributions' then select group_id into g from public.savings_goals where id=(coalesce(a,b)->>'goal_id')::uuid;
 else g:=(coalesce(a,b)->>'group_id')::uuid; end if;
 insert into history(group_id,actor_id,entity,entity_id,action,"before","after") values(g,auth.uid(),TG_TABLE_NAME,
 case when TG_TABLE_NAME='memberships' then (coalesce(a,b)->>'user_id')::uuid else (coalesce(a,b)->>'id')::uuid end,
 case when TG_OP='UPDATE' and a->>'deleted_at' is not null and b->>'deleted_at' is null then 'delete' else lower(TG_OP) end,b,a);
 return coalesce(new,old);
end $$;

create trigger audit_wallets after insert or update on public.wallets for each row execute function private.audit();
create trigger audit_savings_goals after insert or update on public.savings_goals for each row execute function private.audit();
create trigger audit_savings_contributions after insert or update on public.savings_contributions for each row execute function private.audit();
create trigger audit_abono_entries after insert or update on public.abono_entries for each row execute function private.audit();

-- Private helper functions
create or replace function private.lock_goal(gid uuid) returns savings_goals language plpgsql security definer set search_path = public, pg_temp as $$
declare v_goal savings_goals; begin
 select * into v_goal from savings_goals where id=gid and group_id=private.require_group() for update;
 if not found then raise exception 'Savings goal not in your group'; end if;
 return v_goal;
end $$;

create or replace function private.abono_confirmed_net(p_group_id uuid, p_u uuid, p_v uuid, p_exclude_id uuid default null)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select sum(owed_amount_centavos) from public.abono_entries
     where group_id = p_group_id and status = 'confirmed' and deleted_at is null
       and kind = 'expense' and from_member = p_v and to_member = p_u
       and id is distinct from p_exclude_id), 0
  ) - coalesce(
    (select sum(owed_amount_centavos) from public.abono_entries
     where group_id = p_group_id and status = 'confirmed' and deleted_at is null
       and kind = 'expense' and from_member = p_u and to_member = p_v
       and id is distinct from p_exclude_id), 0
  ) - coalesce(
    (select sum(owed_amount_centavos) from public.abono_entries
     where group_id = p_group_id and status = 'confirmed' and deleted_at is null
       and kind = 'settlement' and from_member = p_u and to_member = p_v
       and id is distinct from p_exclude_id), 0
  ) + coalesce(
    (select sum(owed_amount_centavos) from public.abono_entries
     where group_id = p_group_id and status = 'confirmed' and deleted_at is null
       and kind = 'settlement' and from_member = p_v and to_member = p_u
       and id is distinct from p_exclude_id), 0
  );
$$;

-- 3. Views (security_invoker = true)
drop view if exists public.cycle_summary cascade;
create view public.cycle_summary with (security_invoker = true) as
select
  c.*,
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
    when c.receiver_id = w.holder_id or c.received_at is not null then 'Received'
    else 'Waiting for Got it'
  end as payout_state,
  greatest(0, c.end_date - public.hulog_today() + 1)::integer as days_left,
  w.holder_id as holder_id,
  w.label as wallet_label
from public.cycles c
join public.wallets w on w.id = c.wallet_id;

create view public.savings_goal_summary with (security_invoker = true) as
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
  end as expected_steps_today
from public.savings_goals g
join public.wallets w on w.id = g.wallet_id;

create view public.savings_member_progress with (security_invoker = true) as
select
  g.id as goal_id,
  m.user_id as member_id,
  case
    when g.goal_mode = 'matched' then (g.step_amount_centavos * g.num_steps)::bigint
    else g.target_amount_centavos
  end as expected_centavos,
  coalesce((select sum(amount_centavos) from public.savings_contributions sc where sc.goal_id = g.id and sc.member_id = m.user_id and sc.status = 'confirmed' and sc.deleted_at is null), 0)::bigint as confirmed_centavos,
  coalesce((select sum(amount_centavos) from public.savings_contributions sc where sc.goal_id = g.id and sc.member_id = m.user_id and sc.status = 'pending' and sc.deleted_at is null), 0)::bigint as pending_centavos,
  coalesce((select sum(steps) from public.savings_contributions sc where sc.goal_id = g.id and sc.member_id = m.user_id and sc.status = 'confirmed' and sc.deleted_at is null), 0)::integer as confirmed_steps,
  coalesce((select sum(steps) from public.savings_contributions sc where sc.goal_id = g.id and sc.member_id = m.user_id and sc.status = 'pending' and sc.deleted_at is null), 0)::integer as pending_steps
from public.savings_goals g
join public.memberships m on m.group_id = g.group_id and m.status = 'active';

create view public.custody_summary with (security_invoker = true) as
select
  w.id as wallet_id,
  w.group_id,
  w.holder_id,
  w.label,
  w.archived_at,
  exists(select 1 from public.memberships m where m.group_id = w.group_id and m.user_id = w.holder_id and m.status = 'active') as holder_active,
  coalesce((select sum(cs.pot_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0)::bigint as paluwagan_centavos,
  coalesce((select sum(gs.saved_centavos) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0)::bigint as ipon_centavos,
  (coalesce((select sum(cs.pot_centavos) from public.cycle_summary cs where cs.wallet_id = w.id and cs.status = 'accepted' and cs.payout_state is distinct from 'Received'), 0) + coalesce((select sum(gs.saved_centavos) from public.savings_goal_summary gs where gs.wallet_id = w.id and gs.status = 'accepted' and gs.withdrawn_at is null), 0))::bigint as total_centavos
from public.wallets w;

create view public.abono_summary with (security_invoker = true) as
select
  m1.group_id as group_id,
  m1.user_id as debtor_id,
  m2.user_id as creditor_id,
  greatest(0,
    coalesce((
      select sum(ae.owed_amount_centavos) from public.abono_entries ae
      where ae.group_id = m1.group_id and ae.from_member = m2.user_id and ae.to_member = m1.user_id
        and ae.kind = 'expense' and ae.status = 'confirmed' and ae.deleted_at is null
    ), 0)
    - coalesce((
      select sum(ae.owed_amount_centavos) from public.abono_entries ae
      where ae.group_id = m1.group_id and ae.from_member = m1.user_id and ae.to_member = m2.user_id
        and ae.kind = 'expense' and ae.status = 'confirmed' and ae.deleted_at is null
    ), 0)
    - coalesce((
      select sum(ae.owed_amount_centavos) from public.abono_entries ae
      where ae.group_id = m1.group_id and ae.from_member = m1.user_id and ae.to_member = m2.user_id
        and ae.kind = 'settlement' and ae.status = 'confirmed' and ae.deleted_at is null
    ), 0)
    + coalesce((
      select sum(ae.owed_amount_centavos) from public.abono_entries ae
      where ae.group_id = m1.group_id and ae.from_member = m2.user_id and ae.to_member = m1.user_id
        and ae.kind = 'settlement' and ae.status = 'confirmed' and ae.deleted_at is null
    ), 0)
  )::bigint as owed_centavos,
  coalesce((
    select sum(ae.owed_amount_centavos) from public.abono_entries ae
    where ae.group_id = m1.group_id and ae.from_member = m1.user_id and ae.to_member = m2.user_id
      and ae.kind = 'settlement' and ae.status = 'pending' and ae.deleted_at is null
  ), 0)::bigint as pending_settlement_centavos
from public.memberships m1
join public.memberships m2 on m2.group_id = m1.group_id and m2.status = 'active' and m1.status = 'active' and m1.user_id <> m2.user_id;

-- 4. RPCs

-- create_group
create or replace function public.create_group(p_name text, p_pot_location text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid;
 label text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'Already has a membership'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Group name required'; end if;
 insert into groups(name,owner_id,pot_location) values(trim(p_name),auth.uid(),coalesce(p_pot_location,'')) returning id into g;
 insert into memberships(group_id,user_id,status) values(g,auth.uid(),'active');
 label := coalesce(nullif(btrim(p_pot_location), ''), 'Main Pot');
 insert into public.wallets(group_id, holder_id, label, created_by) values(g, auth.uid(), label, auth.uid());
 return g;
end $$;

-- update_group
create or replace function public.update_group(p_name text, p_pot_location text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 loc text := nullif(btrim(p_pot_location), '');
 wid uuid;
begin
 if not private.owns(g) then raise exception 'Owner only'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Group name required'; end if;
 update groups set name = trim(p_name), pot_location = coalesce(p_pot_location, '') where id = g;

 if loc is not null then
  select id into wid from public.wallets
  where group_id = g and holder_id = auth.uid() and archived_at is null
  order by created_at asc limit 1;

  if wid is not null then
   if not exists(
    select 1 from public.wallets
    where group_id = g and holder_id = auth.uid() and lower(btrim(label)) = lower(loc)
      and archived_at is null and id <> wid
   ) then
    update public.wallets set label = loc where id = wid;
   end if;
  else
   insert into public.wallets(group_id, holder_id, label, created_by)
   values(g, auth.uid(), loc, auth.uid());
  end if;
 end if;
end $$;

-- create_wallet
create or replace function public.create_wallet(p_label text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 lbl text := nullif(btrim(p_label), '');
 wid uuid;
begin
 if lbl is null or char_length(lbl) > 40 then
  raise exception 'Wallet label must be 1 to 40 characters';
 end if;
 if exists(
  select 1 from public.wallets
  where group_id = g and holder_id = auth.uid() and lower(btrim(label)) = lower(lbl) and archived_at is null
 ) then
  raise exception 'Wallet with this label already exists';
 end if;
 insert into public.wallets(group_id, holder_id, label, created_by)
 values(g, auth.uid(), lbl, auth.uid()) returning id into wid;
 return wid;
end $$;

-- update_wallet
create or replace function public.update_wallet(p_id uuid, p_label text, p_archive boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 v_w wallets;
 lbl text := nullif(btrim(p_label), '');
begin
 select * into v_w from public.wallets where id = p_id and group_id = g for update;
 if not found then raise exception 'Wallet not found'; end if;
 if v_w.holder_id <> auth.uid() then raise exception 'Wallet holder only'; end if;

 if p_archive then
  if exists(
   select 1 from public.cycles c
   where c.group_id = g
     and (c.wallet_id = p_id or c.pending_wallet_id = p_id)
     and (
       c.status = 'proposed'
       or (
         c.status = 'accepted'
         and not (
           public.hulog_today() > c.end_date
           and (
             c.receiver_id = (select holder_id from public.wallets where id = c.wallet_id)
             or c.received_at is not null
           )
         )
       )
     )
  ) or exists(
   select 1 from public.savings_goals sg
   where sg.group_id = g
     and (sg.wallet_id = p_id or sg.pending_wallet_id = p_id)
     and (
       sg.status = 'proposed'
       or (sg.status = 'accepted' and sg.withdrawn_at is null)
     )
  ) then
   raise exception 'Cannot archive wallet in active use';
  end if;
  update public.wallets set archived_at = now() where id = p_id;
  if lbl is not null then
   if char_length(lbl) > 40 then raise exception 'Wallet label must be 1 to 40 characters'; end if;
   update public.wallets set label = lbl where id = p_id;
  end if;
 else
  if lbl is null or char_length(lbl) > 40 then
   raise exception 'Wallet label must be 1 to 40 characters';
  end if;
  if exists(
   select 1 from public.wallets
   where group_id = g and holder_id = auth.uid() and lower(btrim(label)) = lower(lbl)
     and archived_at is null and id <> p_id
  ) then
   raise exception 'Wallet with this label already exists';
  end if;
  update public.wallets set label = lbl where id = p_id;
 end if;
end $$;

-- propose_cycle (drop 4-arg signature first to avoid overload ambiguity)
drop function if exists public.propose_cycle(bigint, integer, date, uuid);

create or replace function public.propose_cycle(
  p_daily_amount_centavos bigint,
  p_num_days integer,
  p_start_date date default null,
  p_receiver_id uuid default null,
  p_wallet_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 receiver uuid;
 previous uuid;
 cid uuid;
 s date := coalesce(p_start_date, hulog_today() + 1);
 v_wallet wallets;
 chosen_wallet uuid;
begin
 perform 1 from groups where id = g for update;
 if exists(select 1 from cycles where group_id = g and (status = 'proposed' or (status = 'accepted' and hulog_today() <= end_date))) then
  raise exception 'A live cycle already exists';
 end if;
 if s < hulog_today() then raise exception 'Start date must be today or later'; end if;
 select receiver_id into previous from cycles where group_id = g and status = 'accepted' order by accepted_at desc, created_at desc limit 1;
 if p_receiver_id is not null then receiver := p_receiver_id;
 elsif previous is null then select owner_id into receiver from groups where id = g;
 else select user_id into receiver from memberships where group_id = g and status = 'active' and user_id <> previous; end if;
 if receiver is null or not exists(select 1 from memberships where group_id = g and user_id = receiver and status = 'active') then
  raise exception 'Receiver must be active in your group';
 end if;

 if p_wallet_id is not null then
  select * into v_wallet from public.wallets where id = p_wallet_id and group_id = g;
  if not found then raise exception 'Wallet not found in group'; end if;
  if v_wallet.archived_at is not null then raise exception 'Wallet is archived'; end if;
  if not exists(select 1 from public.memberships where group_id = g and user_id = v_wallet.holder_id and status = 'active') then
   raise exception 'Wallet holder is not active';
  end if;
  chosen_wallet := v_wallet.id;
 else
  select id into chosen_wallet from public.wallets
  where group_id = g and holder_id = auth.uid() and archived_at is null
  order by created_at asc limit 1;

  if chosen_wallet is null then
   select wal.id into chosen_wallet from public.wallets wal
   join public.memberships m on m.group_id = wal.group_id and m.user_id = wal.holder_id and m.status = 'active'
   where wal.group_id = g and wal.archived_at is null
   order by wal.created_at asc limit 1;
  end if;
  if chosen_wallet is null then raise exception 'No active wallet available'; end if;
 end if;

 insert into cycles(group_id, daily_amount_centavos, num_days, start_date, end_date, receiver_id, proposed_by, status, wallet_id)
 values(g, p_daily_amount_centavos, p_num_days, s, s + p_num_days - 1, receiver, auth.uid(), 'proposed', chosen_wallet)
 returning id into cid;
 return cid;
end $$;

-- propose_cycle_wallet
create or replace function public.propose_cycle_wallet(p_cycle_id uuid, p_wallet_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_cycle_id);
 cur_w wallets;
 new_w wallets;
begin
 if c.status <> 'accepted' then raise exception 'Cycle must be accepted'; end if;
 select * into cur_w from public.wallets where id = c.wallet_id;
 if c.received_at is not null or (public.hulog_today() > c.end_date and c.receiver_id = cur_w.holder_id) then
  raise exception 'Cycle payout already received';
 end if;

 select * into new_w from public.wallets where id = p_wallet_id and group_id = c.group_id;
 if not found then raise exception 'Target wallet not in group'; end if;
 if new_w.archived_at is not null then raise exception 'Target wallet is archived'; end if;
 if not exists(select 1 from public.memberships where group_id = c.group_id and user_id = new_w.holder_id and status = 'active') then
  raise exception 'Target wallet holder is not active';
 end if;
 if c.wallet_id = p_wallet_id then raise exception 'Wallet already selected'; end if;

 if public.hulog_today() > c.end_date then
  if auth.uid() <> cur_w.holder_id or new_w.holder_id <> cur_w.holder_id then
   raise exception 'After cycle end, only current holder can move between their own wallets';
  end if;
  update public.cycles set wallet_id = p_wallet_id, pending_wallet_id = null, wallet_proposed_by = null where id = c.id;
  return;
 end if;

 if new_w.holder_id = cur_w.holder_id and auth.uid() = cur_w.holder_id then
  update public.cycles set wallet_id = p_wallet_id, pending_wallet_id = null, wallet_proposed_by = null where id = c.id;
 else
  update public.cycles set pending_wallet_id = p_wallet_id, wallet_proposed_by = auth.uid() where id = c.id;
 end if;
end $$;

-- respond_cycle_wallet
create or replace function public.respond_cycle_wallet(p_cycle_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_cycle_id);
 cur_w wallets;
 new_w wallets;
begin
 if c.pending_wallet_id is null then raise exception 'No pending wallet proposal'; end if;
 if p_action = 'cancel' then
  if c.wallet_proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.cycles set pending_wallet_id = null, wallet_proposed_by = null where id = c.id;
 elsif p_action in ('accept', 'decline') then
  if c.wallet_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  if p_action = 'decline' then
   update public.cycles set pending_wallet_id = null, wallet_proposed_by = null where id = c.id;
  else
   select * into cur_w from public.wallets where id = c.wallet_id;
   if c.received_at is not null or (public.hulog_today() > c.end_date and c.receiver_id = cur_w.holder_id) then
    raise exception 'Cycle payout already received';
   end if;
   select * into new_w from public.wallets where id = c.pending_wallet_id and group_id = c.group_id;
   if not found or new_w.archived_at is not null then raise exception 'Target wallet is not available'; end if;
   if not exists(select 1 from public.memberships where group_id = c.group_id and user_id = new_w.holder_id and status = 'active') then
    raise exception 'Target wallet holder is not active';
   end if;
   if public.hulog_today() > c.end_date and new_w.holder_id <> cur_w.holder_id then
    raise exception 'After cycle end, only current holder can move between their own wallets';
   end if;
   update public.cycles set wallet_id = c.pending_wallet_id, pending_wallet_id = null, wallet_proposed_by = null where id = c.id;
  end if;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- receive_payout
create or replace function public.receive_payout(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_id);
begin
 if c.status <> 'accepted' or hulog_today() <= c.end_date or c.receiver_id <> auth.uid() then
  raise exception 'Closed cycle receiver only';
 end if;
 update cycles set received_at = coalesce(received_at, now()), pending_wallet_id = null, wallet_proposed_by = null where id = p_id;
end $$;

-- record_payment (both 3-arg and 2-arg signatures)
create or replace function public.record_payment(p_cycle_id uuid, p_days integer, p_note text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_cycle_id);
 pid uuid;
 n text := coalesce(p_note, '');
begin
 if c.status <> 'accepted' or hulog_today() > c.end_date then raise exception 'Payment window closed'; end if;
 if p_days is null or p_days < 1 or coalesce((select sum(days) from payments where cycle_id = c.id and member_id = auth.uid() and deleted_at is null), 0) + p_days > c.num_days then
  raise exception 'Payment days exceed cap or are invalid';
 end if;
 if char_length(n) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
 insert into payments(cycle_id, member_id, days, amount_centavos, note, status, was_confirmed, created_by)
 values(c.id, auth.uid(), p_days, p_days * c.daily_amount_centavos, n, 'pending', false, auth.uid()) returning id into pid;
 return pid;
end $$;

create or replace function public.record_payment(p_cycle_id uuid, p_days integer) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 return public.record_payment(p_cycle_id, p_days, '');
end $$;

-- edit_payment (drop 3-arg signature first to avoid overload ambiguity)
drop function if exists public.edit_payment(uuid, integer, boolean);

create or replace function public.edit_payment(
  p_id uuid,
  p_days integer default null,
  p_delete boolean default false,
  p_note text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
 p payments;
 c cycles;
begin
 select p0.* into p from payments p0 join cycles c0 on c0.id = p0.cycle_id where p0.id = p_id and c0.group_id = private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c := private.lock_cycle(p.cycle_id);
 select * into p from payments where id = p_id for update;
 if p.deleted_at is not null then raise exception 'Payment deleted'; end if;
 if p_delete then update payments set deleted_at = now(), edited_at = now() where id = p_id; return; end if;
 if p_note is not null and char_length(p_note) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;

 if p_days is not null and p_days <> p.days then
  if p_days < 1 or coalesce((select sum(days) from payments where cycle_id = c.id and member_id = p.member_id and deleted_at is null and id <> p_id), 0) + p_days > c.num_days then
   raise exception 'Payment days exceed cap or are invalid';
  end if;
  update payments set
   days = p_days,
   amount_centavos = p_days * c.daily_amount_centavos,
   note = coalesce(p_note, p.note),
   status = 'pending',
   confirmed_by = null,
   confirmed_at = null,
   edited_at = now()
  where id = p_id;
  return;
 end if;

 if p_note is not null and p_note <> p.note then
  update payments set note = p_note, edited_at = now() where id = p_id;
  return;
 end if;
end $$;

-- propose_savings_goal
create or replace function public.propose_savings_goal(
  p_title text,
  p_goal_mode text,
  p_wallet_id uuid,
  p_start_date date default null,
  p_step_amount_centavos bigint default null,
  p_cadence_days integer default null,
  p_num_steps integer default null,
  p_target_amount_centavos bigint default null,
  p_end_date date default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 title text := nullif(btrim(p_title), '');
 s date := coalesce(p_start_date, public.hulog_today() + 1);
 e date;
 target bigint;
 v_wallet wallets;
 gid uuid;
begin
 perform 1 from public.groups where id = g for update;
 if (
  select count(*) from public.savings_goals
  where group_id = g
    and ((status = 'proposed' and public.hulog_today() <= start_date) or (status = 'accepted' and withdrawn_at is null))
 ) >= 3 then
  raise exception 'Maximum of 3 active savings goals reached';
 end if;

 if title is null or char_length(title) > 60 then
  raise exception 'Title must be 1 to 60 characters';
 end if;

 select * into v_wallet from public.wallets where id = p_wallet_id and group_id = g;
 if not found then raise exception 'Wallet not found in group'; end if;
 if v_wallet.archived_at is not null then raise exception 'Wallet is archived'; end if;
 if not exists(select 1 from public.memberships where group_id = g and user_id = v_wallet.holder_id and status = 'active') then
  raise exception 'Wallet holder is not active';
 end if;

 if s < public.hulog_today() then raise exception 'Start date must be today or later'; end if;

 if p_goal_mode = 'matched' then
  if p_step_amount_centavos is null or p_step_amount_centavos not between 100 and 1000000000 then
   raise exception 'Step amount must be between 100 and 1000000000 centavos';
  end if;
  if p_cadence_days is null or p_cadence_days not between 1 and 90 then
   raise exception 'Cadence days must be between 1 and 90';
  end if;
  if p_num_steps is null or p_num_steps not between 1 and 366 then
   raise exception 'Num steps must be between 1 and 366';
  end if;
  e := s + ((p_num_steps - 1) * p_cadence_days);
  if (e - s) > 1095 then raise exception 'Goal duration cannot exceed 3 years'; end if;
  target := (p_step_amount_centavos * p_num_steps * 2)::bigint;

  insert into public.savings_goals(
   group_id, title, goal_mode, wallet_id, target_amount_centavos,
   step_amount_centavos, cadence_days, num_steps, start_date, end_date,
   proposed_by, status
  ) values (
   g, title, 'matched', v_wallet.id, target,
   p_step_amount_centavos, p_cadence_days, p_num_steps, s, e,
   auth.uid(), 'proposed'
  ) returning id into gid;

 elsif p_goal_mode = 'flexible' then
  if p_step_amount_centavos is not null or p_cadence_days is not null or p_num_steps is not null then
   raise exception 'Step parameters not allowed for flexible mode';
  end if;
  if p_target_amount_centavos is null or p_target_amount_centavos not between 100 and 10000000000 then
   raise exception 'Target amount must be between 100 and 10000000000 centavos';
  end if;
  e := coalesce(p_end_date, s);
  if e < s then raise exception 'End date must be on or after start date'; end if;
  if (e - s) > 1095 then raise exception 'Goal duration cannot exceed 3 years'; end if;

  insert into public.savings_goals(
   group_id, title, goal_mode, wallet_id, target_amount_centavos,
   start_date, end_date, proposed_by, status
  ) values (
   g, title, 'flexible', v_wallet.id, p_target_amount_centavos,
   s, e, auth.uid(), 'proposed'
  ) returning id into gid;

 else
  raise exception 'Invalid goal mode';
 end if;

 return gid;
end $$;

-- respond_savings_goal
create or replace function public.respond_savings_goal(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_id);
begin
 if v_goal.status <> 'proposed' then raise exception 'Not a proposed goal'; end if;
 if p_action = 'cancel' then
  if v_goal.proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.savings_goals set status = 'cancelled' where id = p_id;
 elsif p_action in ('accept', 'decline') then
  if v_goal.proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  if p_action = 'accept' then
   if public.hulog_today() > v_goal.start_date then raise exception 'Proposal start date has passed'; end if;
   update public.savings_goals set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_id;
  else
   update public.savings_goals set status = 'declined' where id = p_id;
  end if;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- propose_goal_wallet
create or replace function public.propose_goal_wallet(p_goal_id uuid, p_wallet_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_goal_id);
 cur_w wallets;
 new_w wallets;
begin
 if v_goal.status <> 'accepted' or v_goal.withdrawn_at is not null then raise exception 'Goal is not active'; end if;
 select * into cur_w from public.wallets where id = v_goal.wallet_id;
 select * into new_w from public.wallets where id = p_wallet_id and group_id = v_goal.group_id;
 if not found then raise exception 'Target wallet not in group'; end if;
 if new_w.archived_at is not null then raise exception 'Target wallet is archived'; end if;
 if not exists(select 1 from public.memberships where group_id = v_goal.group_id and user_id = new_w.holder_id and status = 'active') then
  raise exception 'Target wallet holder is not active';
 end if;
 if v_goal.wallet_id = p_wallet_id then raise exception 'Wallet already selected'; end if;

 if new_w.holder_id = cur_w.holder_id and auth.uid() = cur_w.holder_id then
  update public.savings_goals set wallet_id = p_wallet_id, pending_wallet_id = null, wallet_proposed_by = null where id = v_goal.id;
 else
  update public.savings_goals set pending_wallet_id = p_wallet_id, wallet_proposed_by = auth.uid() where id = v_goal.id;
 end if;
end $$;

-- respond_goal_wallet
create or replace function public.respond_goal_wallet(p_goal_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_goal_id);
 new_w wallets;
begin
 if v_goal.pending_wallet_id is null then raise exception 'No pending wallet proposal'; end if;
 if p_action = 'cancel' then
  if v_goal.wallet_proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.savings_goals set pending_wallet_id = null, wallet_proposed_by = null where id = v_goal.id;
 elsif p_action in ('accept', 'decline') then
  if v_goal.wallet_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  if p_action = 'decline' then
   update public.savings_goals set pending_wallet_id = null, wallet_proposed_by = null where id = v_goal.id;
  else
   if v_goal.withdrawn_at is not null then raise exception 'Goal already withdrawn'; end if;
   select * into new_w from public.wallets where id = v_goal.pending_wallet_id and group_id = v_goal.group_id;
   if not found or new_w.archived_at is not null then raise exception 'Target wallet is not available'; end if;
   if not exists(select 1 from public.memberships where group_id = v_goal.group_id and user_id = new_w.holder_id and status = 'active') then
    raise exception 'Target wallet holder is not active';
   end if;
   update public.savings_goals set wallet_id = v_goal.pending_wallet_id, pending_wallet_id = null, wallet_proposed_by = null where id = v_goal.id;
  end if;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- propose_withdraw_goal
create or replace function public.propose_withdraw_goal(p_goal_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_goal_id);
begin
 if v_goal.status <> 'accepted' or v_goal.withdrawn_at is not null then raise exception 'Goal is not active'; end if;
 if v_goal.withdraw_proposed_by is not null then raise exception 'Withdrawal already proposed'; end if;
 if exists(
  select 1 from public.savings_contributions
  where goal_id = v_goal.id and deleted_at is null and (status = 'pending' or delete_proposed_by is not null)
 ) then
  raise exception 'Cannot propose withdrawal with pending contributions or pending deletions';
 end if;
 update public.savings_goals set withdraw_proposed_by = auth.uid() where id = v_goal.id;
end $$;

-- respond_withdraw_goal
create or replace function public.respond_withdraw_goal(p_goal_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_goal_id);
begin
 if v_goal.withdraw_proposed_by is null then raise exception 'No withdrawal proposed'; end if;
 if p_action = 'cancel' then
  if v_goal.withdraw_proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.savings_goals set withdraw_proposed_by = null where id = v_goal.id;
 elsif p_action in ('confirm', 'accept') then
  if v_goal.withdraw_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  if exists(
   select 1 from public.savings_contributions
   where goal_id = v_goal.id and deleted_at is null and (status = 'pending' or delete_proposed_by is not null)
  ) then
   raise exception 'Cannot withdraw with pending contributions or pending deletions';
  end if;
  update public.savings_goals set
   withdrawn_at = now(),
   withdrawn_by = auth.uid(),
   withdraw_proposed_by = null,
   pending_wallet_id = null,
   wallet_proposed_by = null
  where id = v_goal.id;
 elsif p_action = 'decline' then
  if v_goal.withdraw_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  update public.savings_goals set withdraw_proposed_by = null where id = v_goal.id;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- record_savings_contribution
create or replace function public.record_savings_contribution(
  p_goal_id uuid,
  p_steps integer default null,
  p_amount_centavos bigint default null,
  p_note text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_goal savings_goals := private.lock_goal(p_goal_id);
 n text := coalesce(p_note, '');
 amt bigint;
 curr_steps integer;
 curr_amt bigint;
 cid uuid;
begin
 if v_goal.status <> 'accepted' or v_goal.withdrawn_at is not null then raise exception 'Goal is not active'; end if;
 if v_goal.withdraw_proposed_by is not null then raise exception 'Withdrawal in progress'; end if;
 if char_length(n) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;

 if v_goal.goal_mode = 'matched' then
  if p_steps is null or p_steps < 1 then raise exception 'Steps must be at least 1'; end if;
  amt := (p_steps * v_goal.step_amount_centavos)::bigint;
  curr_steps := coalesce((
   select sum(steps) from public.savings_contributions
   where goal_id = v_goal.id and member_id = auth.uid() and deleted_at is null
  ), 0);
  if curr_steps + p_steps > v_goal.num_steps then raise exception 'Steps exceed goal cap'; end if;

  insert into public.savings_contributions(goal_id, member_id, steps, amount_centavos, note, status, was_confirmed, created_by)
  values(v_goal.id, auth.uid(), p_steps, amt, n, 'pending', false, auth.uid()) returning id into cid;

 else -- flexible
  if p_steps is not null then raise exception 'Steps not allowed for flexible goal'; end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 then raise exception 'Amount must be greater than 0'; end if;
  curr_amt := coalesce((
   select sum(amount_centavos) from public.savings_contributions
   where goal_id = v_goal.id and deleted_at is null
  ), 0);
  if curr_amt + p_amount_centavos > v_goal.target_amount_centavos then raise exception 'Contribution exceeds goal target'; end if;

  insert into public.savings_contributions(goal_id, member_id, steps, amount_centavos, note, status, was_confirmed, created_by)
  values(v_goal.id, auth.uid(), null, p_amount_centavos, n, 'pending', false, auth.uid()) returning id into cid;
 end if;

 return cid;
end $$;

-- confirm_savings_contribution
create or replace function public.confirm_savings_contribution(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 sc savings_contributions;
 v_goal savings_goals;
begin
 select sc0.* into sc from public.savings_contributions sc0
 join public.savings_goals g0 on g0.id = sc0.goal_id
 where sc0.id = p_id and g0.group_id = private.require_group();
 if not found then raise exception 'Contribution not in your group'; end if;
 v_goal := private.lock_goal(sc.goal_id);
 select * into sc from public.savings_contributions where id = p_id for update;
 if sc.deleted_at is not null or sc.status <> 'pending' then raise exception 'Not a pending contribution'; end if;
 if v_goal.withdrawn_at is not null then raise exception 'Goal already withdrawn'; end if;
 if auth.uid() = coalesce(sc.last_edited_by, sc.created_by) then raise exception 'Other member must confirm'; end if;

 update public.savings_contributions set
  status = 'confirmed',
  was_confirmed = true,
  confirmed_by = auth.uid(),
  confirmed_at = now(),
  delete_proposed_by = null
 where id = p_id;
end $$;

-- edit_savings_contribution
create or replace function public.edit_savings_contribution(
  p_id uuid,
  p_steps integer default null,
  p_amount_centavos bigint default null,
  p_delete boolean default false,
  p_note text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
 sc savings_contributions;
 v_goal savings_goals;
 curr_steps integer;
 curr_amt bigint;
 new_steps integer;
 new_amt bigint;
 fin_changed boolean := false;
begin
 select sc0.* into sc from public.savings_contributions sc0
 join public.savings_goals g0 on g0.id = sc0.goal_id
 where sc0.id = p_id and g0.group_id = private.require_group();
 if not found then raise exception 'Contribution not in your group'; end if;
 v_goal := private.lock_goal(sc.goal_id);
 select * into sc from public.savings_contributions where id = p_id for update;
 if sc.deleted_at is not null then raise exception 'Contribution deleted'; end if;
 if v_goal.withdrawn_at is not null then raise exception 'Goal already withdrawn'; end if;
 if v_goal.withdraw_proposed_by is not null then raise exception 'Withdrawal in progress'; end if;
 if p_note is not null and char_length(p_note) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;

 if p_delete then
  if sc.status = 'pending' then
   update public.savings_contributions set deleted_at = now(), edited_at = now() where id = p_id;
  else
   if sc.delete_proposed_by is not null then raise exception 'Delete already proposed'; end if;
   update public.savings_contributions set delete_proposed_by = auth.uid(), edited_at = now() where id = p_id;
  end if;
  return;
 end if;

 if v_goal.goal_mode = 'matched' then
  if p_steps is not null and p_steps <> sc.steps then
   if p_steps < 1 then raise exception 'Steps must be at least 1'; end if;
   curr_steps := coalesce((
    select sum(steps) from public.savings_contributions
    where goal_id = v_goal.id and member_id = sc.member_id and deleted_at is null and id <> p_id
   ), 0);
   if curr_steps + p_steps > v_goal.num_steps then raise exception 'Steps exceed goal cap'; end if;
   new_steps := p_steps;
   new_amt := (p_steps * v_goal.step_amount_centavos)::bigint;
   fin_changed := true;
  else
   new_steps := sc.steps;
   new_amt := sc.amount_centavos;
  end if;
 else -- flexible
  if p_amount_centavos is not null and p_amount_centavos <> sc.amount_centavos then
   if p_amount_centavos <= 0 then raise exception 'Amount must be greater than 0'; end if;
   curr_amt := coalesce((
    select sum(amount_centavos) from public.savings_contributions
    where goal_id = v_goal.id and deleted_at is null and id <> p_id
   ), 0);
   if curr_amt + p_amount_centavos > v_goal.target_amount_centavos then raise exception 'Contribution exceeds goal target'; end if;
   new_steps := null;
   new_amt := p_amount_centavos;
   fin_changed := true;
  else
   new_steps := null;
   new_amt := sc.amount_centavos;
  end if;
 end if;

 if not fin_changed then
  if p_note is not null and p_note <> sc.note then
   update public.savings_contributions set note = p_note, edited_at = now() where id = p_id;
  end if;
  return;
 else
  update public.savings_contributions set
   steps = new_steps,
   amount_centavos = new_amt,
   note = coalesce(p_note, sc.note),
   status = 'pending',
   last_edited_by = auth.uid(),
   confirmed_by = null,
   confirmed_at = null,
   delete_proposed_by = null,
   edited_at = now()
  where id = p_id;
 end if;
end $$;

-- respond_delete_savings_contribution
create or replace function public.respond_delete_savings_contribution(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 sc savings_contributions;
 v_goal savings_goals;
begin
 select sc0.* into sc from public.savings_contributions sc0
 join public.savings_goals g0 on g0.id = sc0.goal_id
 where sc0.id = p_id and g0.group_id = private.require_group();
 if not found then raise exception 'Contribution not in your group'; end if;
 v_goal := private.lock_goal(sc.goal_id);
 select * into sc from public.savings_contributions where id = p_id for update;
 if sc.deleted_at is not null then raise exception 'Contribution already deleted'; end if;
 if sc.delete_proposed_by is null then raise exception 'No delete proposal pending'; end if;
 if v_goal.withdrawn_at is not null then raise exception 'Goal already withdrawn'; end if;

 if p_action = 'cancel' then
  if sc.delete_proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.savings_contributions set delete_proposed_by = null, edited_at = now() where id = p_id;
 elsif p_action in ('confirm', 'accept') then
  if sc.delete_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  update public.savings_contributions set deleted_at = now(), delete_proposed_by = null, edited_at = now() where id = p_id;
 elsif p_action = 'decline' then
  if sc.delete_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  update public.savings_contributions set delete_proposed_by = null, edited_at = now() where id = p_id;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- record_abono_entry
create or replace function public.record_abono_entry(
  p_kind text,
  p_from_member uuid,
  p_to_member uuid,
  p_description text,
  p_total_amount_centavos bigint,
  p_owed_amount_centavos bigint,
  p_entry_date date default null,
  p_note text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ed date := coalesce(p_entry_date, public.hulog_today());
 descr text := nullif(btrim(p_description), '');
 n text := coalesce(p_note, '');
 aid uuid;
 net_owed bigint;
 pending_settle bigint;
begin
 perform 1 from public.groups where id = g for update;
 if p_kind not in ('expense', 'settlement') then raise exception 'Invalid abono kind'; end if;
 if p_from_member is null or p_to_member is null or p_from_member = p_to_member then
  raise exception 'From and to members must be distinct';
 end if;
 if not exists(select 1 from public.memberships where group_id = g and user_id = p_from_member and status = 'active') or
    not exists(select 1 from public.memberships where group_id = g and user_id = p_to_member and status = 'active') then
  raise exception 'Both members must be active in group';
 end if;
 if auth.uid() not in (p_from_member, p_to_member) then raise exception 'Actor must be one of the members'; end if;
 if ed > public.hulog_today() then raise exception 'Entry date cannot be in the future'; end if;
 if descr is null or char_length(descr) > 80 then raise exception 'Description must be 1 to 80 characters'; end if;
 if char_length(n) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
 if p_total_amount_centavos is null or p_total_amount_centavos <= 0 then raise exception 'Total amount must be greater than 0'; end if;
 if p_owed_amount_centavos is null or p_owed_amount_centavos <= 0 or p_owed_amount_centavos > p_total_amount_centavos then
  raise exception 'Owed amount must be greater than 0 and not exceed total amount';
 end if;

 if p_kind = 'settlement' then
  if p_total_amount_centavos <> p_owed_amount_centavos then
   raise exception 'Settlement total amount must equal owed amount';
  end if;
  net_owed := private.abono_confirmed_net(g, p_from_member, p_to_member);
  pending_settle := coalesce((
   select sum(owed_amount_centavos) from public.abono_entries
   where group_id = g and from_member = p_from_member and to_member = p_to_member
     and kind = 'settlement' and status = 'pending' and deleted_at is null
  ), 0);
  if p_owed_amount_centavos + pending_settle > net_owed then
   raise exception 'Settlement exceeds owed balance';
  end if;
 end if;

 insert into public.abono_entries(
  group_id, kind, from_member, to_member, description,
  total_amount_centavos, owed_amount_centavos, entry_date, note,
  status, was_confirmed, created_by
 ) values (
  g, p_kind, p_from_member, p_to_member, descr,
  p_total_amount_centavos, p_owed_amount_centavos, ed, n,
  'pending', false, auth.uid()
 ) returning id into aid;
 return aid;
end $$;

-- confirm_abono_entry
create or replace function public.confirm_abono_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ae abono_entries;
 net_owed bigint;
begin
 perform 1 from public.groups where id = g for update;
 select * into ae from public.abono_entries where id = p_id and group_id = g for update;
 if not found then raise exception 'Entry not in your group'; end if;
 if ae.deleted_at is not null or ae.status <> 'pending' then raise exception 'Not a pending entry'; end if;
 if auth.uid() = coalesce(ae.last_edited_by, ae.created_by) then raise exception 'Other member must confirm'; end if;

 if ae.kind = 'settlement' then
  net_owed := private.abono_confirmed_net(g, ae.from_member, ae.to_member);
  if ae.owed_amount_centavos > net_owed then
   raise exception 'Settlement exceeds owed balance';
  end if;
 end if;

 update public.abono_entries set
  status = 'confirmed',
  was_confirmed = true,
  confirmed_by = auth.uid(),
  confirmed_at = now(),
  delete_proposed_by = null
 where id = p_id;
end $$;

-- edit_abono_entry
create or replace function public.edit_abono_entry(
  p_id uuid,
  p_from_member uuid default null,
  p_to_member uuid default null,
  p_description text default null,
  p_total_amount_centavos bigint default null,
  p_owed_amount_centavos bigint default null,
  p_entry_date date default null,
  p_note text default null,
  p_delete boolean default false
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ae abono_entries;
 new_from uuid;
 new_to uuid;
 new_desc text;
 new_total bigint;
 new_owed bigint;
 new_date date;
 new_note text;
 fin_changed boolean;
 net_owed bigint;
 pending_settle bigint;
begin
 perform 1 from public.groups where id = g for update;
 select * into ae from public.abono_entries where id = p_id and group_id = g for update;
 if not found then raise exception 'Entry not in your group'; end if;
 if ae.deleted_at is not null then raise exception 'Entry deleted'; end if;

 if p_delete then
  if ae.status = 'pending' then
   update public.abono_entries set deleted_at = now(), edited_at = now() where id = p_id;
  else
   if ae.delete_proposed_by is not null then raise exception 'Delete already proposed'; end if;
   update public.abono_entries set delete_proposed_by = auth.uid(), edited_at = now() where id = p_id;
  end if;
  return;
 end if;

 new_from := coalesce(p_from_member, ae.from_member);
 new_to := coalesce(p_to_member, ae.to_member);
 new_desc := coalesce(nullif(btrim(p_description), ''), ae.description);
 new_total := coalesce(p_total_amount_centavos, ae.total_amount_centavos);
 new_owed := coalesce(p_owed_amount_centavos, ae.owed_amount_centavos);
 new_date := coalesce(p_entry_date, ae.entry_date);
 new_note := coalesce(p_note, ae.note);

 if new_from = new_to then raise exception 'From and to members must be distinct'; end if;
 if not exists(select 1 from public.memberships where group_id = g and user_id = new_from and status = 'active') or
    not exists(select 1 from public.memberships where group_id = g and user_id = new_to and status = 'active') then
  raise exception 'Both members must be active in group';
 end if;
 if auth.uid() not in (new_from, new_to) then raise exception 'Actor must be one of the members'; end if;
 if new_date > public.hulog_today() then raise exception 'Entry date cannot be in the future'; end if;
 if char_length(new_desc) > 80 then raise exception 'Description must be 1 to 80 characters'; end if;
 if char_length(new_note) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
 if new_total <= 0 or new_owed <= 0 or new_owed > new_total then
  raise exception 'Owed amount must be greater than 0 and not exceed total amount';
 end if;

 if ae.kind = 'settlement' and new_total <> new_owed then
  raise exception 'Settlement total amount must equal owed amount';
 end if;

 fin_changed := (
  new_from <> ae.from_member or
  new_to <> ae.to_member or
  new_desc <> ae.description or
  new_total <> ae.total_amount_centavos or
  new_owed <> ae.owed_amount_centavos
 );

 if ae.kind = 'settlement' and fin_changed then
  net_owed := private.abono_confirmed_net(g, new_from, new_to, p_id);
  pending_settle := coalesce((
   select sum(owed_amount_centavos) from public.abono_entries
   where group_id = g and from_member = new_from and to_member = new_to
     and kind = 'settlement' and status = 'pending' and deleted_at is null and id <> p_id
  ), 0);
  if new_owed + pending_settle > net_owed then
   raise exception 'Settlement exceeds owed balance';
  end if;
 end if;

 if not fin_changed then
  if new_note <> ae.note or new_date <> ae.entry_date then
   update public.abono_entries set note = new_note, entry_date = new_date, edited_at = now() where id = p_id;
  end if;
  return;
 else
  update public.abono_entries set
   from_member = new_from,
   to_member = new_to,
   description = new_desc,
   total_amount_centavos = new_total,
   owed_amount_centavos = new_owed,
   entry_date = new_date,
   note = new_note,
   status = 'pending',
   last_edited_by = auth.uid(),
   confirmed_by = null,
   confirmed_at = null,
   delete_proposed_by = null,
   edited_at = now()
  where id = p_id;
 end if;
end $$;

-- respond_delete_abono_entry
create or replace function public.respond_delete_abono_entry(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ae abono_entries;
begin
 perform 1 from public.groups where id = g for update;
 select * into ae from public.abono_entries where id = p_id and group_id = g for update;
 if not found then raise exception 'Entry not in your group'; end if;
 if ae.deleted_at is not null then raise exception 'Entry already deleted'; end if;
 if ae.delete_proposed_by is null then raise exception 'No delete proposal pending'; end if;

 if p_action = 'cancel' then
  if ae.delete_proposed_by <> auth.uid() then raise exception 'Proposer only'; end if;
  update public.abono_entries set delete_proposed_by = null, edited_at = now() where id = p_id;
 elsif p_action in ('confirm', 'accept') then
  if ae.delete_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  update public.abono_entries set deleted_at = now(), delete_proposed_by = null, edited_at = now() where id = p_id;
 elsif p_action = 'decline' then
  if ae.delete_proposed_by = auth.uid() then raise exception 'Other member must respond'; end if;
  update public.abono_entries set delete_proposed_by = null, edited_at = now() where id = p_id;
 else
  raise exception 'Invalid action';
 end if;
end $$;

-- 5. Revocation & Grants
revoke all on public.wallets, public.savings_goals, public.savings_contributions, public.abono_entries from anon, authenticated;
grant select on public.wallets, public.savings_goals, public.savings_contributions, public.abono_entries to authenticated;
revoke all on public.cycle_summary, public.savings_goal_summary, public.savings_member_progress, public.custody_summary, public.abono_summary from anon, authenticated;
grant select on public.cycle_summary, public.savings_goal_summary, public.savings_member_progress, public.custody_summary, public.abono_summary to authenticated;

revoke execute on function
  private.lock_goal(uuid),
  private.abono_confirmed_net(uuid, uuid, uuid, uuid),
  private.cycles_default_wallet()
from public, anon, authenticated;

revoke execute on function
  public.create_wallet(text),
  public.update_wallet(uuid, text, boolean),
  public.propose_cycle(bigint, integer, date, uuid, uuid),
  public.propose_cycle_wallet(uuid, uuid),
  public.respond_cycle_wallet(uuid, text),
  public.receive_payout(uuid),
  public.record_payment(uuid, integer),
  public.record_payment(uuid, integer, text),
  public.edit_payment(uuid, integer, boolean, text),
  public.propose_savings_goal(text, text, uuid, date, bigint, integer, integer, bigint, date),
  public.respond_savings_goal(uuid, text),
  public.propose_goal_wallet(uuid, uuid),
  public.respond_goal_wallet(uuid, text),
  public.propose_withdraw_goal(uuid),
  public.respond_withdraw_goal(uuid, text),
  public.record_savings_contribution(uuid, integer, bigint, text),
  public.confirm_savings_contribution(uuid),
  public.edit_savings_contribution(uuid, integer, bigint, boolean, text),
  public.respond_delete_savings_contribution(uuid, text),
  public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text),
  public.confirm_abono_entry(uuid),
  public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean),
  public.respond_delete_abono_entry(uuid, text)
from public, anon;

grant execute on function
  public.create_wallet(text),
  public.update_wallet(uuid, text, boolean),
  public.propose_cycle(bigint, integer, date, uuid, uuid),
  public.propose_cycle_wallet(uuid, uuid),
  public.respond_cycle_wallet(uuid, text),
  public.receive_payout(uuid),
  public.record_payment(uuid, integer),
  public.record_payment(uuid, integer, text),
  public.edit_payment(uuid, integer, boolean, text),
  public.propose_savings_goal(text, text, uuid, date, bigint, integer, integer, bigint, date),
  public.respond_savings_goal(uuid, text),
  public.propose_goal_wallet(uuid, uuid),
  public.respond_goal_wallet(uuid, text),
  public.propose_withdraw_goal(uuid),
  public.respond_withdraw_goal(uuid, text),
  public.record_savings_contribution(uuid, integer, bigint, text),
  public.confirm_savings_contribution(uuid),
  public.edit_savings_contribution(uuid, integer, bigint, boolean, text),
  public.respond_delete_savings_contribution(uuid, text),
  public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text),
  public.confirm_abono_entry(uuid),
  public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean),
  public.respond_delete_abono_entry(uuid, text)
to authenticated;

