alter table public.notification_prefs
  add column language text not null default 'taglish'
  check (language in ('en', 'tl', 'taglish'));

drop function public.get_notification_prefs();
create function public.get_notification_prefs()
returns table (reminder_time time, enabled boolean, language text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(p.reminder_time, '20:00'::time),
         coalesce(p.enabled, false),
         coalesce(p.language, 'taglish')
  from (select auth.uid() as user_id) actor
  left join public.notification_prefs p on p.user_id = actor.user_id
  where actor.user_id is not null
$$;

create function public.set_notification_language(p_language text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_language is null or p_language not in ('en', 'tl', 'taglish') then
    raise exception 'Valid notification language required';
  end if;
  insert into public.notification_prefs(user_id, language)
  values (auth.uid(), p_language)
  on conflict (user_id) do update
    set language = excluded.language,
        updated_at = now();
end $$;

revoke execute on function public.get_notification_prefs() from public, anon, authenticated;
revoke execute on function public.set_notification_language(text) from public, anon, authenticated;
grant execute on function public.get_notification_prefs() to authenticated;
grant execute on function public.set_notification_language(text) to authenticated;
