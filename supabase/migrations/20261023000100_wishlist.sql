-- Shared wishlist ("Gusto natin"): a record of things the pair wants to buy.
-- Hulog only records; marking an item bought never moves money.
create table public.wishlist_items (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id),
 title text not null check (char_length(btrim(title)) between 1 and 60),
 price_centavos bigint not null check (price_centavos between 1 and 10000000000),
 note text check (note is null or char_length(note) <= 140),
 linked_goal_id uuid references public.savings_goals(id),
 added_by uuid not null references public.profiles(id),
 status text not null default 'wanted' check (status in ('wanted','bought')),
 bought_by uuid references public.profiles(id),
 bought_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 check ((status = 'bought' and bought_by is not null and bought_at is not null)
   or (status = 'wanted' and bought_by is null and bought_at is null))
);
create index on public.wishlist_items(group_id);
create index on public.wishlist_items(linked_goal_id) where linked_goal_id is not null;

alter table public.wishlist_items enable row level security;
-- Shared list: both active members read every non-deleted item of their group.
create policy read_wishlist_items on public.wishlist_items for select to authenticated
 using (group_id = private.active_group() and deleted_at is null);

-- Group-shared record: same audit trail as the abono and ipon tables.
create trigger audit_wishlist_items after insert or update on public.wishlist_items
 for each row execute function private.audit();

-- Lock one live item of the caller's active group.
create function private.lock_wishlist_item(p_id uuid) returns public.wishlist_items
language plpgsql security definer set search_path = public, pg_temp as $$
declare w wishlist_items; gid uuid:=private.require_group();
begin
 select * into w from wishlist_items where id=p_id and group_id=gid and deleted_at is null for update;
 if not found then raise exception 'Wishlist item unavailable'; end if;
 return w;
end $$;
-- Validate and normalise the editable fields; returns the trimmed title and note.
create function private.check_wishlist_fields(p_group uuid,p_title text,p_price_centavos bigint,p_note text,p_linked_goal_id uuid,
 out v_title text,out v_note text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 v_title:=nullif(btrim(p_title),'');
 if v_title is null or char_length(v_title)>60 then raise exception 'Wishlist title must be 1 to 60 characters'; end if;
 if p_price_centavos is null or p_price_centavos not between 1 and 10000000000 then raise exception 'Invalid wishlist price'; end if;
 v_note:=nullif(btrim(p_note),'');
 if char_length(v_note)>140 then raise exception 'Note must be at most 140 characters'; end if;
 if p_linked_goal_id is not null and not exists (select 1 from savings_goals g
   where g.id=p_linked_goal_id and g.group_id=p_group and g.withdrawn_at is null and g.status in ('proposed','accepted')) then
  raise exception 'Linked goal must be an active shared ipon goal in your group';
 end if;
end $$;

create function public.add_wishlist_item(p_title text,p_price_centavos bigint,p_note text default null,p_linked_goal_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid:=private.require_group(); f record; result uuid;
begin
 -- Serialise adds so two members cannot both take the last slot.
 perform 1 from groups where id=gid for update;
 select * into f from private.check_wishlist_fields(gid,p_title,p_price_centavos,p_note,p_linked_goal_id);
 if (select count(*) from wishlist_items where group_id=gid and deleted_at is null)>=30 then
  raise exception 'Maximum of 30 wishlist items reached';
 end if;
 insert into wishlist_items(group_id,title,price_centavos,note,linked_goal_id,added_by)
 values(gid,f.v_title,p_price_centavos,f.v_note,p_linked_goal_id,auth.uid()) returning id into result;
 return result;
end $$;
create function public.edit_wishlist_item(p_id uuid,p_title text,p_price_centavos bigint,p_note text default null,p_linked_goal_id uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w wishlist_items:=private.lock_wishlist_item(p_id); f record;
begin
 if w.status<>'wanted' then raise exception 'Bought items cannot be edited'; end if;
 select * into f from private.check_wishlist_fields(w.group_id,p_title,p_price_centavos,p_note,p_linked_goal_id);
 update wishlist_items set title=f.v_title,price_centavos=p_price_centavos,note=f.v_note,
 linked_goal_id=p_linked_goal_id,updated_at=now() where id=w.id;
end $$;
create function public.set_wishlist_bought(p_id uuid,p_bought boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w wishlist_items:=private.lock_wishlist_item(p_id);
begin
 if p_bought is null then raise exception 'Bought flag required'; end if;
 if (w.status='bought')=p_bought then return; end if;
 if p_bought then
  update wishlist_items set status='bought',bought_by=auth.uid(),bought_at=now(),updated_at=now() where id=w.id;
 else
  update wishlist_items set status='wanted',bought_by=null,bought_at=null,updated_at=now() where id=w.id;
 end if;
end $$;
create function public.delete_wishlist_item(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w wishlist_items:=private.lock_wishlist_item(p_id);
begin
 update wishlist_items set deleted_at=now(),updated_at=now() where id=w.id;
end $$;

revoke all on public.wishlist_items from public,anon,authenticated;
grant select on public.wishlist_items to authenticated;
revoke all on function private.lock_wishlist_item(uuid),private.check_wishlist_fields(uuid,text,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.add_wishlist_item(text,bigint,text,uuid),public.edit_wishlist_item(uuid,text,bigint,text,uuid),public.set_wishlist_bought(uuid,boolean),public.delete_wishlist_item(uuid) from public,anon,authenticated;
grant execute on function public.add_wishlist_item(text,bigint,text,uuid),public.edit_wishlist_item(uuid,text,bigint,text,uuid),public.set_wishlist_bought(uuid,boolean),public.delete_wishlist_item(uuid) to authenticated;
