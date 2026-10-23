-- Idempotent paluwagan payments and abono entries (offline recording, SPEC 10.11).
-- A retry after a lost response must never create a second record. The client
-- sends a random per-request key; the server returns the row it already wrote
-- for that (caller, key) instead of inserting again. Hulog still only records
-- money: every existing cap, window, lock and membership rule runs unchanged
-- for a first insert, judged by hulog_today() at the moment the RPC runs.

alter table public.payments add column client_request_id uuid;
alter table public.abono_entries add column client_request_id uuid;
-- The index spans soft-deleted rows on purpose: a deleted record stays the
-- answer to its own key, so a late retry can never bring it back.
create unique index payments_created_by_client_request_id_key
 on public.payments (created_by, client_request_id) where client_request_id is not null;
create unique index abono_entries_created_by_client_request_id_key
 on public.abono_entries (created_by, client_request_id) where client_request_id is not null;

-- record_payment: the 3-argument form is replaced by one with the trailing key.
-- The 2-argument wrapper from the v2 migration stays and now reaches this
-- function with no key, so callers that omit the key behave exactly as before.
drop function public.record_payment(uuid, integer, text);

create function public.record_payment(
 p_cycle_id uuid,
 p_days integer,
 p_note text,
 p_client_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_cycle_id);
 pid uuid;
 prior payments;
 n text := coalesce(p_note, '');
begin
 -- Replay first, inside the cycle lock: a retry of a request that already
 -- landed returns that payment even if the day cap is now full or the window
 -- has since closed, and it never writes again.
 if p_client_request_id is not null then
  select * into prior from payments where created_by = auth.uid() and client_request_id = p_client_request_id;
  if found then
   if prior.cycle_id <> c.id then raise exception 'Request id already used'; end if;
   return prior.id;
  end if;
 end if;
 if c.status <> 'accepted' or hulog_today() > c.end_date then raise exception 'Payment window closed'; end if;
 if p_days is null or p_days < 1 or coalesce((select sum(days) from payments where cycle_id = c.id and member_id = auth.uid() and deleted_at is null), 0) + p_days > c.num_days then
  raise exception 'Payment days exceed cap or are invalid';
 end if;
 if char_length(n) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
 begin
  insert into payments(cycle_id, member_id, days, amount_centavos, note, status, was_confirmed, created_by, client_request_id)
  values(c.id, auth.uid(), p_days, p_days * c.daily_amount_centavos, n, 'pending', false, auth.uid(), p_client_request_id) returning id into pid;
 exception when unique_violation then
  -- The same key landed through a different cycle lock between the replay
  -- check and the insert. Only the key index can raise this, so answer with
  -- that row instead of writing again.
  select * into prior from payments where created_by = auth.uid() and client_request_id = p_client_request_id;
  if not found then raise; end if;
  if prior.cycle_id <> c.id then raise exception 'Request id already used'; end if;
  pid := prior.id;
 end;
 return pid;
end $$;

-- record_abono_entry: the 8-argument form stays as a thin wrapper (same
-- defaults, same behaviour, no key). The keyed form takes all nine arguments,
-- without defaults, so a request never matches two overloads.
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
begin
 return public.record_abono_entry(p_kind, p_from_member, p_to_member, p_description,
  p_total_amount_centavos, p_owed_amount_centavos, p_entry_date, p_note, null::uuid);
end $$;

create function public.record_abono_entry(
 p_kind text,
 p_from_member uuid,
 p_to_member uuid,
 p_description text,
 p_total_amount_centavos bigint,
 p_owed_amount_centavos bigint,
 p_entry_date date,
 p_note text,
 p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ed date := coalesce(p_entry_date, public.hulog_today());
 descr text := nullif(btrim(p_description), '');
 n text := coalesce(p_note, '');
 aid uuid;
 prior abono_entries;
 net_owed bigint;
 pending_settle bigint;
begin
 perform 1 from public.groups where id = g for update;
 -- Replay first, inside the group lock: a retry of a request that already
 -- landed returns that entry even though a settlement check would now count
 -- the entry itself as pending, and it never writes again.
 if p_client_request_id is not null then
  select * into prior from public.abono_entries where created_by = auth.uid() and client_request_id = p_client_request_id;
  if found then
   if prior.group_id <> g then raise exception 'Request id already used'; end if;
   return prior.id;
  end if;
 end if;
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

 begin
  insert into public.abono_entries(
   group_id, kind, from_member, to_member, description,
   total_amount_centavos, owed_amount_centavos, entry_date, note,
   status, was_confirmed, created_by, client_request_id
  ) values (
   g, p_kind, p_from_member, p_to_member, descr,
   p_total_amount_centavos, p_owed_amount_centavos, ed, n,
   'pending', false, auth.uid(), p_client_request_id
  ) returning id into aid;
 exception when unique_violation then
  select * into prior from public.abono_entries where created_by = auth.uid() and client_request_id = p_client_request_id;
  if not found then raise; end if;
  if prior.group_id <> g then raise exception 'Request id already used'; end if;
  aid := prior.id;
 end;
 return aid;
end $$;

-- Grants follow the repo convention: nothing for public or anon, execute for
-- authenticated. The dropped 3-argument payment form takes its grants with it.
revoke all on function
 public.record_payment(uuid, integer, text, uuid),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid)
from public, anon, authenticated;
grant execute on function
 public.record_payment(uuid, integer, text, uuid),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid)
to authenticated;