create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke create on schema public from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null,
 avatar_url text, email text not null
);
create table public.groups (
 id uuid primary key default gen_random_uuid(), name text not null,
 owner_id uuid not null references profiles, pot_location text not null default '', created_at timestamptz not null default now()
);
create table public.memberships (
 group_id uuid not null references groups, user_id uuid primary key references profiles,
 status text not null check(status in ('pending','active','denied','removed')),
 last_seen_history_at timestamptz not null default '-infinity', created_at timestamptz not null default now()
);
create table public.invites (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups,
 token_hash text not null unique, created_by uuid not null references profiles,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '24 hours',
 used_by uuid references profiles, used_at timestamptz, revoked_at timestamptz
);
create table public.cycles (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups,
 daily_amount_centavos bigint not null check(daily_amount_centavos > 0),
 num_days integer not null check(num_days between 1 and 366), start_date date not null, end_date date not null,
 receiver_id uuid not null references profiles, proposed_by uuid not null references profiles,
 status text not null check(status in ('proposed','declined','cancelled','accepted')),
 accepted_by uuid references profiles, accepted_at timestamptz, received_at timestamptz, created_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), cycle_id uuid not null references cycles,
 member_id uuid not null references profiles, days integer not null check(days >= 1), amount_centavos bigint not null,
 status text not null check(status in ('pending','confirmed')), was_confirmed boolean not null default false,
 created_by uuid not null references profiles, created_at timestamptz not null default now(),
 confirmed_by uuid references profiles, confirmed_at timestamptz, edited_at timestamptz, deleted_at timestamptz
);
create table public.repayments (
 id uuid primary key default gen_random_uuid(), cycle_id uuid not null references cycles,
 debtor_id uuid not null references profiles, creditor_id uuid not null references profiles,
 amount_centavos bigint not null check(amount_centavos > 0), status text not null check(status in ('pending','confirmed')),
 was_confirmed boolean not null default false, created_by uuid not null references profiles,
 created_at timestamptz not null default now(), confirmed_at timestamptz, edited_at timestamptz, deleted_at timestamptz
);
create table public.history (
 id bigint generated always as identity primary key, group_id uuid not null references groups,
 actor_id uuid references profiles, entity text not null, entity_id uuid not null, action text not null,
 "before" jsonb, "after" jsonb, created_at timestamptz not null default clock_timestamp()
);
create index on memberships(group_id);
create index on cycles(group_id,created_at);
create index on payments(cycle_id,member_id);
create index on repayments(cycle_id,debtor_id);
create index on history(group_id,created_at);

create function public.hulog_today() returns date language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'Asia/Manila')::date $$;
create function private.active_group() returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select group_id from memberships where user_id=auth.uid() and status='active' $$;
create function private.owns(g uuid) returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from groups where id=g and owner_id=auth.uid() and id=private.active_group()) $$;
create function private.visible_profile(u uuid) returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from memberships m where m.user_id=u and m.group_id=private.active_group() and (m.status='active' or private.owns(m.group_id))) $$;
create function private.profile_sync() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 insert into profiles(id,display_name,avatar_url,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','Member'),new.raw_user_meta_data->>'avatar_url',coalesce(new.email,''))
 on conflict(id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,email=excluded.email;
 return new;
end $$;
create trigger sync_profile after insert or update of raw_user_meta_data,email on auth.users for each row execute function private.profile_sync();
insert into profiles select id,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Member'),raw_user_meta_data->>'avatar_url',coalesce(email,'') from auth.users;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table memberships enable row level security;
alter table invites enable row level security;
alter table cycles enable row level security;
alter table payments enable row level security;
alter table repayments enable row level security;
alter table history enable row level security;
create policy read_profiles on profiles for select to authenticated using(private.visible_profile(id));
create policy read_groups on groups for select to authenticated using(id=private.active_group());
create policy read_memberships on memberships for select to authenticated using(user_id=auth.uid() or (group_id=private.active_group() and (status='active' or private.owns(group_id))));
create policy read_invites on invites for select to authenticated using(group_id=private.active_group());
create policy read_cycles on cycles for select to authenticated using(group_id=private.active_group());
create policy read_payments on payments for select to authenticated using(exists(select 1 from cycles c where c.id=cycle_id and c.group_id=private.active_group()));
create policy read_repayments on repayments for select to authenticated using(exists(select 1 from cycles c where c.id=cycle_id and c.group_id=private.active_group()));
create policy read_history on history for select to authenticated using(group_id=private.active_group());

create function private.audit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid; b jsonb; a jsonb;
begin
 if TG_OP='UPDATE' and new is not distinct from old then return new; end if;
 if TG_TABLE_NAME='memberships' and TG_OP='UPDATE' and to_jsonb(new)-'last_seen_history_at'=to_jsonb(old)-'last_seen_history_at' then return new; end if;
 if TG_OP<>'INSERT' then b:=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then a:=to_jsonb(new); end if;
 if TG_TABLE_NAME='groups' then g:=coalesce(a,b)->>'id';
 elsif TG_TABLE_NAME in ('payments','repayments') then select group_id into g from cycles where id=(coalesce(a,b)->>'cycle_id')::uuid;
 else g:=(coalesce(a,b)->>'group_id')::uuid; end if;
 insert into history(group_id,actor_id,entity,entity_id,action,"before","after") values(g,auth.uid(),TG_TABLE_NAME,
 case when TG_TABLE_NAME='memberships' then (coalesce(a,b)->>'user_id')::uuid else (coalesce(a,b)->>'id')::uuid end,
 case when TG_OP='UPDATE' and a->>'deleted_at' is not null and b->>'deleted_at' is null then 'delete' else lower(TG_OP) end,b,a);
 return coalesce(new,old);
end $$;
create trigger audit_groups after insert or update on groups for each row execute function private.audit();
create trigger audit_memberships after insert or update or delete on memberships for each row execute function private.audit();
create trigger audit_invites after insert or update on invites for each row execute function private.audit();
create trigger audit_cycles after insert or update on cycles for each row execute function private.audit();
create trigger audit_payments after insert or update on payments for each row execute function private.audit();
create trigger audit_repayments after insert or update on repayments for each row execute function private.audit();

create function private.require_group() returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g uuid:=private.active_group(); begin if g is null then raise exception 'Active membership required'; end if; return g; end $$;
create function private.lock_cycle(cid uuid) returns cycles language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles; begin select * into c from cycles where id=cid and group_id=private.require_group() for update;
 if not found then raise exception 'Cycle not in your group'; end if; return c; end $$;

create function public.create_group(p_name text,p_pot_location text default '') returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'Already has a membership'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Group name required'; end if;
 insert into groups(name,owner_id,pot_location) values(trim(p_name),auth.uid(),coalesce(p_pot_location,'')) returning id into g;
 insert into memberships(group_id,user_id,status) values(g,auth.uid(),'active'); return g;
end $$;
create function public.update_group(p_name text,p_pot_location text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid:=private.require_group(); begin
 if not private.owns(g) then raise exception 'Owner only'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Group name required'; end if;
 update groups set name=trim(p_name),pot_location=coalesce(p_pot_location,'') where id=g;
end $$;
create function public.create_invite() returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid:=private.require_group(); token text; begin
 if not private.owns(g) then raise exception 'Owner only'; end if;
 perform 1 from groups where id=g for update;
 update invites set revoked_at=now() where group_id=g and used_at is null and revoked_at is null;
 token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 insert into invites(group_id,token_hash,created_by) values(g,encode(extensions.digest(token,'sha256'),'hex'),auth.uid()); return token;
end $$;
create function public.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
 update invites set revoked_at=now() where id=p_id and group_id=private.require_group() and private.owns(group_id);
 if not found then raise exception 'Invite not owned by you'; end if;
end $$;
create function public.claim_invite(p_token text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'Already has a membership'; end if;
 update invites set used_by=auth.uid(),used_at=now() where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and used_at is null and revoked_at is null and expires_at>now() returning group_id into g;
 if g is null then raise exception 'Invite invalid or used'; end if;
 insert into memberships(group_id,user_id,status) values(g,auth.uid(),'pending');
end $$;
create function public.review_member(p_user_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid:=private.require_group(); begin
 if not private.owns(g) then raise exception 'Owner only'; end if;
 perform 1 from groups where id=g for update;
 if p_accept and (select count(*) from memberships where group_id=g and status='active')>=2 then raise exception 'Two active members maximum'; end if;
 update memberships set status=case when p_accept then 'active' else 'denied' end where group_id=g and user_id=p_user_id and status='pending';
 if not found then raise exception 'Pending request not in your group'; end if;
end $$;
create function public.propose_cycle(p_daily_amount_centavos bigint,p_num_days integer,p_start_date date default null,p_receiver_id uuid default null) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid:=private.require_group(); receiver uuid; previous uuid; cid uuid; s date:=coalesce(p_start_date,hulog_today()+1); begin
 perform 1 from groups where id=g for update;
 if exists(select 1 from cycles where group_id=g and (status='proposed' or (status='accepted' and hulog_today()<=end_date))) then raise exception 'A live cycle already exists'; end if;
 if s<hulog_today() then raise exception 'Start date must be today or later'; end if;
 select receiver_id into previous from cycles where group_id=g and status='accepted' order by accepted_at desc,created_at desc limit 1;
 if p_receiver_id is not null then receiver:=p_receiver_id;
 elsif previous is null then select owner_id into receiver from groups where id=g;
 else select user_id into receiver from memberships where group_id=g and status='active' and user_id<>previous; end if;
 if receiver is null or not exists(select 1 from memberships where group_id=g and user_id=receiver and status='active') then raise exception 'Receiver must be active in your group'; end if;
 insert into cycles(group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status)
 values(g,p_daily_amount_centavos,p_num_days,s,s+p_num_days-1,receiver,auth.uid(),'proposed') returning id into cid; return cid;
end $$;
create function public.respond_cycle(p_id uuid,p_action text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_id); begin
 if c.status<>'proposed' then raise exception 'Not a proposal'; end if;
 if p_action='cancel' then
  if c.proposed_by<>auth.uid() then raise exception 'Proposer only'; end if;
  update cycles set status='cancelled' where id=p_id;
 elsif p_action in ('accept','decline') then
  if c.proposed_by=auth.uid() then raise exception 'Other member must respond'; end if;
  if p_action='accept' and hulog_today()>c.start_date then raise exception 'Proposal start date has passed'; end if;
  update cycles set status=case when p_action='accept' then 'accepted' else 'declined' end,
   accepted_by=case when p_action='accept' then auth.uid() end,accepted_at=case when p_action='accept' then now() end where id=p_id;
 else raise exception 'Invalid response'; end if;
end $$;
create function public.record_payment(p_cycle_id uuid,p_days integer) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_cycle_id); pid uuid; owner boolean:=private.owns(c.group_id); begin
 if c.status<>'accepted' or hulog_today()>c.end_date then raise exception 'Payment window closed'; end if;
 if p_days is null or p_days<1 or coalesce((select sum(days) from payments where cycle_id=c.id and member_id=auth.uid() and deleted_at is null),0)+p_days>c.num_days then raise exception 'Payment days exceed cap or are invalid'; end if;
 insert into payments(cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at)
 values(c.id,auth.uid(),p_days,p_days*c.daily_amount_centavos,case when owner then 'confirmed' else 'pending' end,owner,auth.uid(),case when owner then auth.uid() end,case when owner then now() end) returning id into pid; return pid;
end $$;
create function public.confirm_payment(p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p payments; c cycles; begin
 select p0.* into p from payments p0 join cycles c0 on c0.id=p0.cycle_id where p0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c:=private.lock_cycle(p.cycle_id);
 select * into p from payments where id=p_id for update;
 if not private.owns(c.group_id) then raise exception 'Owner only'; end if;
 if p.deleted_at is not null or p.status<>'pending' then raise exception 'Not a pending payment'; end if;
 if hulog_today()>c.end_date+1 and not p.was_confirmed then raise exception 'Confirmation window closed'; end if;
 update payments set status='confirmed',was_confirmed=true,confirmed_by=auth.uid(),confirmed_at=now() where id=p_id;
end $$;
create function public.edit_payment(p_id uuid,p_days integer default null,p_delete boolean default false) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p payments; c cycles; owner boolean; begin
 select p0.* into p from payments p0 join cycles c0 on c0.id=p0.cycle_id where p0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Payment not in your group'; end if;
 c:=private.lock_cycle(p.cycle_id); select * into p from payments where id=p_id for update;
 if p.deleted_at is not null then raise exception 'Payment deleted'; end if;
 if p_delete then update payments set deleted_at=now(),edited_at=now() where id=p_id; return; end if;
 if p_days is null or p_days<1 or coalesce((select sum(days) from payments where cycle_id=c.id and member_id=p.member_id and deleted_at is null and id<>p_id),0)+p_days>c.num_days then raise exception 'Payment days exceed cap or are invalid'; end if;
 if p_days=p.days then return; end if;
 select owner_id=p.member_id into owner from groups where id=c.group_id;
 update payments set days=p_days,amount_centavos=p_days*c.daily_amount_centavos,status=case when owner then 'confirmed' else 'pending' end,
  confirmed_by=case when owner then confirmed_by end,confirmed_at=case when owner then confirmed_at end,edited_at=now() where id=p_id;
end $$;
create function public.receive_payout(p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_id); begin
 if c.status<>'accepted' or hulog_today()<=c.end_date or c.receiver_id<>auth.uid() then raise exception 'Closed cycle receiver only'; end if;
 update cycles set received_at=coalesce(received_at,now()) where id=p_id;
end $$;
create function public.record_repayment(p_cycle_id uuid,p_debtor_id uuid,p_amount_centavos bigint) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c cycles:=private.lock_cycle(p_cycle_id); rid uuid; remaining bigint; begin
 if c.status<>'accepted' or hulog_today()<=c.end_date then raise exception 'Cycle must be closed'; end if;
 if p_debtor_id=c.receiver_id or not exists(select 1 from memberships where group_id=c.group_id and user_id=p_debtor_id and status='active') or auth.uid() not in (p_debtor_id,c.receiver_id) then raise exception 'Debtor or creditor only'; end if;
 remaining:=c.num_days*c.daily_amount_centavos-coalesce((select sum(amount_centavos) from payments where cycle_id=c.id and member_id=p_debtor_id and status='confirmed' and deleted_at is null),0)-coalesce((select sum(amount_centavos) from repayments where cycle_id=c.id and debtor_id=p_debtor_id and deleted_at is null),0);
 if p_amount_centavos is null or p_amount_centavos<=0 or p_amount_centavos>remaining then raise exception 'Repayment exceeds cap or is invalid'; end if;
 insert into repayments(cycle_id,debtor_id,creditor_id,amount_centavos,status,created_by) values(c.id,p_debtor_id,c.receiver_id,p_amount_centavos,'pending',auth.uid()) returning id into rid; return rid;
end $$;
create function public.confirm_repayment(p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r repayments; c cycles; begin
 select r0.* into r from repayments r0 join cycles c0 on c0.id=r0.cycle_id where r0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Repayment not in your group'; end if;
 c:=private.lock_cycle(r.cycle_id); select * into r from repayments where id=p_id for update;
 if r.creditor_id<>auth.uid() then raise exception 'Creditor only'; end if;
 if r.deleted_at is not null or r.status<>'pending' then raise exception 'Not a pending repayment'; end if;
 update repayments set status='confirmed',was_confirmed=true,confirmed_at=now() where id=p_id;
end $$;
create function public.edit_repayment(p_id uuid,p_amount_centavos bigint default null,p_delete boolean default false) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r repayments; c cycles; remaining bigint; begin
 select r0.* into r from repayments r0 join cycles c0 on c0.id=r0.cycle_id where r0.id=p_id and c0.group_id=private.require_group();
 if not found then raise exception 'Repayment not in your group'; end if;
 c:=private.lock_cycle(r.cycle_id); select * into r from repayments where id=p_id for update;
 if r.deleted_at is not null then raise exception 'Repayment deleted'; end if;
 if p_delete then update repayments set deleted_at=now(),edited_at=now() where id=p_id; return; end if;
 remaining:=c.num_days*c.daily_amount_centavos-coalesce((select sum(amount_centavos) from payments where cycle_id=c.id and member_id=r.debtor_id and status='confirmed' and deleted_at is null),0)-coalesce((select sum(amount_centavos) from repayments where cycle_id=c.id and debtor_id=r.debtor_id and deleted_at is null and id<>p_id),0);
 if p_amount_centavos is null or p_amount_centavos<=0 or p_amount_centavos>remaining then raise exception 'Repayment exceeds cap or is invalid'; end if;
 if p_amount_centavos=r.amount_centavos then return; end if;
 update repayments set amount_centavos=p_amount_centavos,status='pending',confirmed_at=null,edited_at=now() where id=p_id;
end $$;
create function public.mark_history_seen() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin update memberships set last_seen_history_at=clock_timestamp() where user_id=auth.uid() and group_id=private.require_group(); end $$;

create view public.cycle_summary with (security_invoker=true) as
select c.*,
 case when status<>'accepted' then status when hulog_today()<start_date then 'upcoming' when hulog_today()<=end_date then 'open' when hulog_today()=end_date+1 then 'settling' else 'ended' end as phase,
 coalesce((select sum(amount_centavos) from payments p where p.cycle_id=c.id and p.status='confirmed' and p.deleted_at is null),0)::bigint as pot_centavos,
 (daily_amount_centavos*num_days*2)::bigint as target_centavos,
 case when status<>'accepted' or hulog_today()<=end_date then null when receiver_id=g.owner_id or received_at is not null then 'Received' else 'Waiting for Got it' end as payout_state,
 greatest(0,end_date-hulog_today()+1) as days_left
from cycles c join groups g on g.id=c.group_id;
create view public.member_progress with (security_invoker=true) as
select c.id as cycle_id,m.user_id as member_id,c.num_days*c.daily_amount_centavos as expected_centavos,
 coalesce((select sum(days) from payments where cycle_id=c.id and member_id=m.user_id and status='confirmed' and deleted_at is null),0)::integer as confirmed_days,
 coalesce((select sum(days) from payments where cycle_id=c.id and member_id=m.user_id and status='pending' and deleted_at is null),0)::integer as pending_days,
 coalesce((select count(*) from payments where cycle_id=c.id and member_id=m.user_id and status='pending' and deleted_at is null),0)::integer as pending_count,
 case when c.status='accepted' and hulog_today()>c.end_date and m.user_id<>c.receiver_id then greatest(0,c.num_days*c.daily_amount_centavos-
 coalesce((select sum(amount_centavos) from payments where cycle_id=c.id and member_id=m.user_id and status='confirmed' and deleted_at is null),0)-
 coalesce((select sum(amount_centavos) from repayments where cycle_id=c.id and debtor_id=m.user_id and status='confirmed' and deleted_at is null),0)) else 0 end::bigint as debt_centavos
from cycles c join memberships m on m.group_id=c.group_id and m.status='active';

create view public.history_changes with (security_invoker=true) as
select h.*, (h.actor_id<>auth.uid() and h.created_at>m.last_seen_history_at) as unread
from history h join memberships m on m.group_id=h.group_id and m.user_id=auth.uid() and m.status='active';

revoke all on all tables in schema public from anon, authenticated;
grant select on profiles,groups,memberships,invites,cycles,payments,repayments,history,cycle_summary,member_progress,history_changes to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_group(),private.owns(uuid),private.visible_profile(uuid) to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function hulog_today(),create_group(text,text),update_group(text,text),create_invite(),revoke_invite(uuid),claim_invite(text),review_member(uuid,boolean),propose_cycle(bigint,integer,date,uuid),respond_cycle(uuid,text),record_payment(uuid,integer),confirm_payment(uuid),edit_payment(uuid,integer,boolean),receive_payout(uuid),record_repayment(uuid,uuid,bigint),confirm_repayment(uuid),edit_repayment(uuid,bigint,boolean),mark_history_seen() to authenticated;
