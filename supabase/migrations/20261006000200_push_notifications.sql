create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reminder_time time not null default '20:00',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'confirm_payment', 'cycle_ends', 'payout_day')),
  ref_id uuid not null,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id, sent_on)
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index notification_log_sent_at_idx on public.notification_log(sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;

-- No client table policies or table grants: user access is through the scoped RPCs below.
revoke all on public.push_subscriptions, public.notification_prefs, public.notification_log from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.notification_prefs, public.notification_log to service_role;

create function public.get_notification_prefs()
returns table (reminder_time time, enabled boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(p.reminder_time, '20:00'::time), coalesce(p.enabled, false)
  from (select auth.uid() as user_id) actor
  left join public.notification_prefs p on p.user_id = actor.user_id
  where actor.user_id is not null
$$;

create function public.set_notification_prefs(p_reminder_time time, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_reminder_time is null or p_enabled is null then
    raise exception 'Signed in user and valid notification preferences required';
  end if;
  insert into public.notification_prefs(user_id, reminder_time, enabled)
  values (auth.uid(), p_reminder_time, p_enabled)
  on conflict (user_id) do update
    set reminder_time = excluded.reminder_time,
        enabled = excluded.enabled,
        updated_at = now();
end $$;

create function public.get_push_subscriptions()
returns table (endpoint text, p256dh text, auth text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, s.created_at
  from public.push_subscriptions s
  where s.user_id = auth.uid()
$$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare affected integer;
begin
  if auth.uid() is null or p_endpoint is null or p_endpoint not like 'https://%'
     or p_p256dh is null or p_auth is null then
    raise exception 'Valid push subscription required';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        created_at = now()
    where public.push_subscriptions.user_id = auth.uid();
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'Push subscription belongs to another account'; end if;
end $$;

create function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Signed in user required'; end if;
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = p_endpoint;
end $$;

revoke execute on function public.get_notification_prefs() from public, anon, authenticated;
revoke execute on function public.set_notification_prefs(time, boolean) from public, anon, authenticated;
revoke execute on function public.get_push_subscriptions() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_push_subscription(text) from public, anon, authenticated;
grant execute on function public.get_notification_prefs() to authenticated;
grant execute on function public.set_notification_prefs(time, boolean) to authenticated;
grant execute on function public.get_push_subscriptions() to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
