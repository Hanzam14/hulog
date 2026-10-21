-- Owner-only ledger, deliberately separate from mutually confirmed shared ipon.
create table public.personal_savings_goals (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id),
 owner_id uuid not null references public.profiles(id),
 title text not null check (char_length(btrim(title)) between 1 and 60),
 target_amount_centavos bigint not null check (target_amount_centavos between 1 and 10000000000),
 visibility text not null default 'private' check (visibility in ('private','shared')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index on public.personal_savings_goals(group_id, owner_id);
create table public.personal_savings_entries (
 id uuid primary key default gen_random_uuid(),
 goal_id uuid not null references public.personal_savings_goals(id),
 kind text not null check (kind in ('deposit','withdrawal')),
 amount_centavos bigint not null check (amount_centavos between 1 and 10000000000),
 entry_date date not null default public.hulog_today(),
 note text not null default '' check (char_length(note) <= 140),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index on public.personal_savings_entries(goal_id);
-- Do not feed snapshots of private rows into the group-readable history table.
create table public.personal_savings_history (
 id bigint generated always as identity primary key,
 goal_id uuid not null references public.personal_savings_goals(id),
 actor_id uuid not null references public.profiles(id),
 entity text not null, entity_id uuid not null, action text not null,
 "before" jsonb, "after" jsonb, created_at timestamptz not null default clock_timestamp()
);
create index on public.personal_savings_history(goal_id,created_at);
alter table public.personal_savings_goals enable row level security;
alter table public.personal_savings_entries enable row level security;
alter table public.personal_savings_history enable row level security;
create policy read_personal_goals on public.personal_savings_goals for select to authenticated
 using (group_id=private.active_group() and
   (owner_id=auth.uid() or (visibility='shared' and deleted_at is null)));
create policy read_personal_entries on public.personal_savings_entries for select to authenticated
 using (exists (select 1 from public.personal_savings_goals g where g.id=goal_id
   and (g.owner_id=auth.uid() or personal_savings_entries.deleted_at is null)));
create policy read_personal_history on public.personal_savings_history for select to authenticated
 using (exists (select 1 from public.personal_savings_goals g where g.id=goal_id and g.owner_id=auth.uid()));

create function private.audit_personal_savings() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare b jsonb; a jsonb; gid uuid;
begin
 if TG_OP='UPDATE' and new is not distinct from old then return new; end if;
 if TG_OP='UPDATE' then b:=to_jsonb(old); end if;
 a:=to_jsonb(new);
 gid:=case when TG_TABLE_NAME='personal_savings_goals' then new.id else (a->>'goal_id')::uuid end;
 insert into personal_savings_history(goal_id,actor_id,entity,entity_id,action,"before","after")
 values(gid,auth.uid(),TG_TABLE_NAME,new.id,
 case when TG_OP='UPDATE' and a->>'deleted_at' is not null and b->>'deleted_at' is null then 'delete' else lower(TG_OP) end,b,a);
 return new;
end $$;
create trigger audit_personal_goals after insert or update on public.personal_savings_goals
 for each row execute function private.audit_personal_savings();
create trigger audit_personal_entries after insert or update on public.personal_savings_entries
 for each row execute function private.audit_personal_savings();

create function private.lock_personal_goal(gid uuid) returns public.personal_savings_goals
language plpgsql security definer set search_path = public, pg_temp as $$
declare g personal_savings_goals;
begin
 select * into g from personal_savings_goals where id=gid and group_id=private.require_group()
   and owner_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Personal savings owner only'; end if;
 return g;
end $$;
create function private.personal_balance(gid uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(sum(case when kind='deposit' then amount_centavos else -amount_centavos end),0)::bigint
 from personal_savings_entries where goal_id=gid and deleted_at is null
$$;
create function public.create_personal_goal(p_title text,p_target_amount_centavos bigint,p_visibility text default 'private')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid:=private.require_group(); result uuid;
begin
 if nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>60 then raise exception 'Goal title must be 1 to 60 characters'; end if;
 if p_target_amount_centavos is null or p_target_amount_centavos not between 1 and 10000000000 then raise exception 'Invalid personal savings amount'; end if;
 if p_visibility is null or p_visibility not in ('private','shared') then raise exception 'Invalid visibility'; end if;
 insert into personal_savings_goals(group_id,owner_id,title,target_amount_centavos,visibility)
 values(gid,auth.uid(),btrim(p_title),p_target_amount_centavos,p_visibility) returning id into result;
 return result;
end $$;
create function public.update_personal_goal(p_goal_id uuid,p_title text default null,p_target_amount_centavos bigint default null,p_visibility text default null,p_delete boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g personal_savings_goals:=private.lock_personal_goal(p_goal_id);
begin
 if p_title is not null and (nullif(btrim(p_title),'') is null or char_length(btrim(p_title))>60) then raise exception 'Goal title must be 1 to 60 characters'; end if;
 if p_target_amount_centavos is not null and p_target_amount_centavos not between 1 and 10000000000 then raise exception 'Invalid personal savings amount'; end if;
 if p_visibility is not null and p_visibility not in ('private','shared') then raise exception 'Invalid visibility'; end if;
 update personal_savings_goals set title=coalesce(btrim(p_title),title),
 target_amount_centavos=coalesce(p_target_amount_centavos,target_amount_centavos), visibility=coalesce(p_visibility,visibility),
 deleted_at=case when p_delete then now() else deleted_at end,updated_at=now() where id=g.id;
end $$;
create function public.record_personal_entry(p_goal_id uuid,p_kind text,p_amount_centavos bigint,p_entry_date date default public.hulog_today(),p_note text default '')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare g personal_savings_goals:=private.lock_personal_goal(p_goal_id); balance bigint; result uuid;
begin
 if p_kind is null or p_kind not in ('deposit','withdrawal') then raise exception 'Invalid personal savings entry kind'; end if;
 if p_amount_centavos is null or p_amount_centavos not between 1 and 10000000000 then raise exception 'Invalid personal savings amount'; end if;
 if p_entry_date is null or p_entry_date>hulog_today() then raise exception 'Entry date cannot be in the future'; end if;
 if p_note is null or char_length(p_note)>140 then raise exception 'Note must be at most 140 characters'; end if;
 balance:=private.personal_balance(g.id)+case when p_kind='deposit' then p_amount_centavos else -p_amount_centavos end;
 if balance not between 0 and 10000000000 then raise exception 'Personal savings balance out of range'; end if;
 insert into personal_savings_entries(goal_id,kind,amount_centavos,entry_date,note)
 values(g.id,p_kind,p_amount_centavos,p_entry_date,p_note) returning id into result;
 return result;
end $$;
create function public.update_personal_entry(p_entry_id uuid,p_amount_centavos bigint default null,p_entry_date date default null,p_note text default null,p_delete boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e personal_savings_entries; gid uuid; balance bigint;
begin
 select goal_id into gid from personal_savings_entries where id=p_entry_id;
 perform private.lock_personal_goal(gid);
 select * into e from personal_savings_entries where id=p_entry_id and deleted_at is null for update;
 if not found then raise exception 'Personal savings entry unavailable'; end if;
 if p_amount_centavos is not null and p_amount_centavos not between 1 and 10000000000 then raise exception 'Invalid personal savings amount'; end if;
 if p_entry_date>hulog_today() then raise exception 'Entry date cannot be in the future'; end if;
 if p_note is not null and char_length(p_note)>140 then raise exception 'Note must be at most 140 characters'; end if;
 balance:=private.personal_balance(gid)
  -(case when e.kind='deposit' then e.amount_centavos else -e.amount_centavos end)
  +(case when p_delete then 0 when e.kind='deposit' then coalesce(p_amount_centavos,e.amount_centavos) else -coalesce(p_amount_centavos,e.amount_centavos) end);
 if balance not between 0 and 10000000000 then raise exception 'Personal savings balance out of range'; end if;
 update personal_savings_entries set amount_centavos=coalesce(p_amount_centavos,amount_centavos),
 entry_date=coalesce(p_entry_date,entry_date),note=coalesce(p_note,note),
 deleted_at=case when p_delete then now() else deleted_at end,updated_at=now() where id=e.id;
end $$;

revoke all on public.personal_savings_goals,public.personal_savings_entries,public.personal_savings_history from public,anon,authenticated;
grant select on public.personal_savings_goals,public.personal_savings_entries,public.personal_savings_history to authenticated;
revoke all on function private.audit_personal_savings(),private.lock_personal_goal(uuid),private.personal_balance(uuid) from public,anon,authenticated;
revoke all on function public.create_personal_goal(text,bigint,text),public.update_personal_goal(uuid,text,bigint,text,boolean),public.record_personal_entry(uuid,text,bigint,date,text),public.update_personal_entry(uuid,bigint,date,text,boolean) from public,anon,authenticated;
grant execute on function public.create_personal_goal(text,bigint,text),public.update_personal_goal(uuid,text,bigint,text,boolean),public.record_personal_entry(uuid,text,bigint,date,text),public.update_personal_entry(uuid,bigint,date,text,boolean) to authenticated;
