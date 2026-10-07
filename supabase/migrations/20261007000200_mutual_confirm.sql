-- Every hulog needs the other active member's confirmation.
create or replace function public.record_payment(p_cycle_id uuid,p_days integer) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_cycle_id); pid uuid; begin
 if c.status<>'accepted' or hulog_today()>c.end_date then raise exception 'Payment window closed'; end if;
 if p_days is null or p_days<1 or coalesce((select sum(days) from payments where cycle_id=c.id and member_id=auth.uid() and deleted_at is null),0)+p_days>c.num_days then raise exception 'Payment days exceed cap or are invalid'; end if;
 insert into payments(cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by)
 values(c.id,auth.uid(),p_days,p_days*c.daily_amount_centavos,'pending',false,auth.uid()) returning id into pid;
 return pid;
end $$;

create or replace function public.confirm_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p payments; c cycles; begin
 select p0.* into p from payments p0 join cycles c0 on c0.id=p0.cycle_id where p0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c:=private.lock_cycle(p.cycle_id);
 select * into p from payments where id=p_id for update;
 if p.member_id=auth.uid() then raise exception 'Other member must confirm'; end if;
 if p.deleted_at is not null or p.status<>'pending' then raise exception 'Not a pending payment'; end if;
 if hulog_today()>c.end_date+1 and not p.was_confirmed then raise exception 'Confirmation window closed'; end if;
 update payments set status='confirmed',was_confirmed=true,confirmed_by=auth.uid(),confirmed_at=now() where id=p_id;
end $$;

create or replace function public.edit_payment(p_id uuid,p_days integer default null,p_delete boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p payments; c cycles; begin
 select p0.* into p from payments p0 join cycles c0 on c0.id=p0.cycle_id where p0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c:=private.lock_cycle(p.cycle_id); select * into p from payments where id=p_id for update;
 if p.deleted_at is not null then raise exception 'Payment deleted'; end if;
 if p_delete then update payments set deleted_at=now(),edited_at=now() where id=p_id; return; end if;
 if p_days is null or p_days<1 or coalesce((select sum(days) from payments where cycle_id=c.id and member_id=p.member_id and deleted_at is null and id<>p_id),0)+p_days>c.num_days then raise exception 'Payment days exceed cap or are invalid'; end if;
 if p_days=p.days then return; end if;
 update payments set days=p_days,amount_centavos=p_days*c.daily_amount_centavos,status='pending',
  confirmed_by=null,confirmed_at=null,edited_at=now() where id=p_id;
end $$;

create or replace function public.give_payout(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_cycle_id); receiver uuid; begin
 if c.receiver_id<>auth.uid() then raise exception 'Current receiver only'; end if;
 if c.status<>'accepted' or c.received_at is not null or hulog_today()>c.end_date then raise exception 'Payout hand-off window closed'; end if;
 select user_id into receiver from memberships where group_id=c.group_id and status='active' and user_id<>auth.uid();
 if receiver is null then raise exception 'Other active member required'; end if;
 update cycles set receiver_id=receiver where id=c.id;
 -- The existing cycle audit trigger records the actor and both receiver ids.
end $$;

revoke execute on function public.record_payment(uuid,integer), public.confirm_payment(uuid),
 public.edit_payment(uuid,integer,boolean), public.give_payout(uuid) from public, anon;
grant execute on function public.record_payment(uuid,integer), public.confirm_payment(uuid),
 public.edit_payment(uuid,integer,boolean), public.give_payout(uuid) to authenticated;

-- Migration runs without auth.uid(): history.actor_id is nullable, so the
-- existing payment audit trigger writes system UPDATE entries (before/after).
-- Preserve was_confirmed so corrected entries remain reconfirmable later.
update public.payments p set status='pending',was_confirmed=true,confirmed_by=null,confirmed_at=null
from public.cycles c join public.groups g on g.id=c.group_id
where p.cycle_id=c.id and c.status='accepted' and public.hulog_today()<=c.end_date+1
 and p.member_id=g.owner_id and p.status='confirmed' and p.deleted_at is null;
