-- Custom abono split (SPEC 10.15): an expense may now have any partner share
-- from 0 to the whole total (for example "all mine" or a 70/30 split), not only
-- 1 centavo or more. Settlements still move a positive amount equal to their
-- total. Only the two bodies below and the table check change; signatures,
-- wrappers, grants, locks, replay and every other rule are exactly as in
-- 20261023000300_payment_proof_ref.sql.
alter table public.abono_entries drop constraint abono_entries_check;
alter table public.abono_entries add constraint abono_entries_split_check check (
  owed_amount_centavos >= 0
  and owed_amount_centavos <= total_amount_centavos
  and (kind <> 'settlement' or total_amount_centavos = owed_amount_centavos)
);

create or replace function public.record_abono_entry(
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
 if p_owed_amount_centavos is null or p_owed_amount_centavos < 0 or p_owed_amount_centavos > p_total_amount_centavos then
  raise exception 'Owed amount must be 0 or more and not exceed total amount';
 end if;
 ref := private.clean_proof_ref(p_proof_ref);

 if p_kind = 'settlement' then
  if p_owed_amount_centavos = 0 then raise exception 'Settlement amount must be greater than 0'; end if;
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

create or replace function public.edit_abono_entry(
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
 if new_total <= 0 then raise exception 'Total amount must be greater than 0'; end if;
 if new_owed < 0 or new_owed > new_total then
  raise exception 'Owed amount must be 0 or more and not exceed total amount';
 end if;
 if ae.kind = 'settlement' and new_owed = 0 then raise exception 'Settlement amount must be greater than 0'; end if;
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
