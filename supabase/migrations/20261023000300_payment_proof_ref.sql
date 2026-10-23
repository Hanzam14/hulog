-- Optional payment proof reference (SPEC 10.14): an e-wallet reference number
-- (GCash or Maya ref no.) a member can attach to a paluwagan payment or an
-- abono entry, so the partner can match it when confirming. It is a reference
-- only: never an account number, PIN or credential, and Hulog still only
-- records money.
alter table public.payments add column proof_ref text
 constraint payments_proof_ref_check check (proof_ref is null or (
  proof_ref = btrim(proof_ref) and char_length(proof_ref) between 4 and 40 and proof_ref ~ '^[A-Za-z0-9 -]+$'));
alter table public.abono_entries add column proof_ref text
 constraint abono_entries_proof_ref_check check (proof_ref is null or (
  proof_ref = btrim(proof_ref) and char_length(proof_ref) between 4 and 40 and proof_ref ~ '^[A-Za-z0-9 -]+$'));

-- Trim a reference; blank means "no reference" (null). Anything else must be 4
-- to 40 letters, digits, spaces or dashes.
create function private.clean_proof_ref(p_ref text) returns text
language plpgsql immutable security definer set search_path = public, pg_temp as $$
declare v text := nullif(btrim(p_ref), '');
begin
 if v is not null and (char_length(v) not between 4 and 40 or v !~ '^[A-Za-z0-9 -]+$') then
  raise exception 'Reference must be 4 to 40 letters, numbers, spaces or dashes';
 end if;
 return v;
end $$;

-- record_payment: the keyed 4-argument form (idempotent_records) becomes a thin
-- wrapper with no reference. The new 5-argument form has no defaults, so a
-- request never matches two overloads: send all five arguments to set a ref.
create function public.record_payment(
 p_cycle_id uuid,
 p_days integer,
 p_note text,
 p_client_request_id uuid,
 p_proof_ref text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 c cycles := private.lock_cycle(p_cycle_id);
 pid uuid;
 prior payments;
 n text := coalesce(p_note, '');
 ref text;
begin
 -- Replay first, inside the cycle lock (see idempotent_records): a retry of a
 -- request that already landed returns that payment and never writes again.
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
 ref := private.clean_proof_ref(p_proof_ref);
 begin
  insert into payments(cycle_id, member_id, days, amount_centavos, note, status, was_confirmed, created_by, client_request_id, proof_ref)
  values(c.id, auth.uid(), p_days, p_days * c.daily_amount_centavos, n, 'pending', false, auth.uid(), p_client_request_id, ref) returning id into pid;
 exception when unique_violation then
  select * into prior from payments where created_by = auth.uid() and client_request_id = p_client_request_id;
  if not found then raise; end if;
  if prior.cycle_id <> c.id then raise exception 'Request id already used'; end if;
  pid := prior.id;
 end;
 return pid;
end $$;

create or replace function public.record_payment(
 p_cycle_id uuid,
 p_days integer,
 p_note text,
 p_client_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 return public.record_payment(p_cycle_id, p_days, p_note, p_client_request_id, null::text);
end $$;

-- record_abono_entry: same pattern. The 10-argument form is the real function;
-- the 9-argument keyed form and the 8-argument form stay as thin wrappers.
create function public.record_abono_entry(
 p_kind text,
 p_from_member uuid,
 p_to_member uuid,
 p_description text,
 p_total_amount_centavos bigint,
 p_owed_amount_centavos bigint,
 p_entry_date date,
 p_note text,
 p_client_request_id uuid,
 p_proof_ref text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
 g uuid := private.require_group();
 ed date := coalesce(p_entry_date, public.hulog_today());
 descr text := nullif(btrim(p_description), '');
 n text := coalesce(p_note, '');
 ref text;
 aid uuid;
 prior abono_entries;
 net_owed bigint;
 pending_settle bigint;
begin
 perform 1 from public.groups where id = g for update;
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
 ref := private.clean_proof_ref(p_proof_ref);

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
   status, was_confirmed, created_by, client_request_id, proof_ref
  ) values (
   g, p_kind, p_from_member, p_to_member, descr,
   p_total_amount_centavos, p_owed_amount_centavos, ed, n,
   'pending', false, auth.uid(), p_client_request_id, ref
  ) returning id into aid;
 exception when unique_violation then
  select * into prior from public.abono_entries where created_by = auth.uid() and client_request_id = p_client_request_id;
  if not found then raise; end if;
  if prior.group_id <> g then raise exception 'Request id already used'; end if;
  aid := prior.id;
 end;
 return aid;
end $$;

create or replace function public.record_abono_entry(
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
begin
 return public.record_abono_entry(p_kind, p_from_member, p_to_member, p_description,
  p_total_amount_centavos, p_owed_amount_centavos, p_entry_date, p_note, p_client_request_id, null::text);
end $$;

-- edit_payment: only the creator, only while the payment is pending, may set,
-- change or clear the reference (an empty string clears it; null leaves it
-- alone). Everything else about editing is unchanged. The 5-argument form has
-- no defaults; the 4-argument form with defaults stays as a thin wrapper.
create function public.edit_payment(
 p_id uuid,
 p_days integer,
 p_delete boolean,
 p_note text,
 p_proof_ref text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
 p payments;
 c cycles;
 new_ref text;
begin
 select p0.* into p from payments p0 join cycles c0 on c0.id = p0.cycle_id where p0.id = p_id and c0.group_id = private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c := private.lock_cycle(p.cycle_id);
 select * into p from payments where id = p_id for update;
 if p.deleted_at is not null then raise exception 'Payment deleted'; end if;
 if p_delete then update payments set deleted_at = now(), edited_at = now() where id = p_id; return; end if;
 if p_note is not null and char_length(p_note) > 140 then raise exception 'Note cannot exceed 140 characters'; end if;
 new_ref := case when p_proof_ref is null then p.proof_ref else private.clean_proof_ref(p_proof_ref) end;
 if new_ref is distinct from p.proof_ref and (p.created_by <> auth.uid() or p.status <> 'pending') then
  raise exception 'Reference can only be changed by its creator while pending';
 end if;

 if p_days is not null and p_days <> p.days then
  if p_days < 1 or coalesce((select sum(days) from payments where cycle_id = c.id and member_id = p.member_id and deleted_at is null and id <> p_id), 0) + p_days > c.num_days then
   raise exception 'Payment days exceed cap or are invalid';
  end if;
  update payments set
   days = p_days,
   amount_centavos = p_days * c.daily_amount_centavos,
   note = coalesce(p_note, p.note),
   proof_ref = new_ref,
   status = 'pending',
   confirmed_by = null,
   confirmed_at = null,
   edited_at = now()
  where id = p_id;
  return;
 end if;

 if (p_note is not null and p_note <> p.note) or new_ref is distinct from p.proof_ref then
  update payments set note = coalesce(p_note, p.note), proof_ref = new_ref, edited_at = now() where id = p_id;
  return;
 end if;
end $$;

create or replace function public.edit_payment(
 p_id uuid,
 p_days integer default null,
 p_delete boolean default false,
 p_note text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
 perform public.edit_payment(p_id, p_days, p_delete, p_note, null::text);
end $$;

-- edit_abono_entry: the same creator-while-pending rule for the reference; the
-- reference is not a financial field, so changing it alone never resets the
-- partner's confirmation. The 10-argument form has no defaults; the original
-- 9-argument form stays as a thin wrapper.
create function public.edit_abono_entry(
 p_id uuid,
 p_from_member uuid,
 p_to_member uuid,
 p_description text,
 p_total_amount_centavos bigint,
 p_owed_amount_centavos bigint,
 p_entry_date date,
 p_note text,
 p_delete boolean,
 p_proof_ref text
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
 new_ref text;
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
 new_ref := case when p_proof_ref is null then ae.proof_ref else private.clean_proof_ref(p_proof_ref) end;

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
 if new_ref is distinct from ae.proof_ref and (ae.created_by <> auth.uid() or ae.status <> 'pending') then
  raise exception 'Reference can only be changed by its creator while pending';
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
  if new_note <> ae.note or new_date <> ae.entry_date or new_ref is distinct from ae.proof_ref then
   update public.abono_entries set note = new_note, entry_date = new_date, proof_ref = new_ref, edited_at = now() where id = p_id;
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
   proof_ref = new_ref,
   status = 'pending',
   last_edited_by = auth.uid(),
   confirmed_by = null,
   confirmed_at = null,
   delete_proposed_by = null,
   edited_at = now()
  where id = p_id;
 end if;
end $$;

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
begin
 perform public.edit_abono_entry(p_id, p_from_member, p_to_member, p_description,
  p_total_amount_centavos, p_owed_amount_centavos, p_entry_date, p_note, p_delete, null::text);
end $$;

-- Grants follow the repo convention: nothing for public or anon, execute for
-- authenticated; the validation helper is private.
revoke all on function private.clean_proof_ref(text) from public, anon, authenticated;
revoke all on function
 public.record_payment(uuid, integer, text, uuid),
 public.record_payment(uuid, integer, text, uuid, text),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid, text),
 public.edit_payment(uuid, integer, boolean, text),
 public.edit_payment(uuid, integer, boolean, text, text),
 public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean),
 public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean, text)
from public, anon, authenticated;
grant execute on function
 public.record_payment(uuid, integer, text, uuid),
 public.record_payment(uuid, integer, text, uuid, text),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid),
 public.record_abono_entry(text, uuid, uuid, text, bigint, bigint, date, text, uuid, text),
 public.edit_payment(uuid, integer, boolean, text),
 public.edit_payment(uuid, integer, boolean, text, text),
 public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean),
 public.edit_abono_entry(uuid, uuid, uuid, text, bigint, bigint, date, text, boolean, text)
to authenticated;
