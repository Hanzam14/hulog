-- Google identity stays separate from the member's own sticker preferences.
alter table public.profiles
  add column nickname text check (char_length(btrim(nickname)) between 1 and 24),
  add column avatar_kind text not null default 'initial'
    check (avatar_kind in ('initial', 'emoji', 'photo')),
  add column avatar_emoji text check (avatar_emoji in (
    '🐷', '🐱', '🐶', '🐰', '🐻', '🐼', '🐸', '🐵',
    '🦊', '🐥', '🌻', '🌸', '🍓', '🥭', '⭐', '🌙'
  )),
  add column color text not null default 'auto'
    check (color in ('auto', 'pink', 'blue', 'green', 'orange', 'purple'));

create function public.update_profile(
  p_nickname text, p_avatar_kind text, p_avatar_emoji text, p_color text
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  nick text := nullif(btrim(p_nickname), '');
  photo text;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if nick is not null and char_length(nick) > 24 then
    raise exception 'Nickname must be 1 to 24 characters';
  end if;
  if p_avatar_kind is null or p_avatar_kind not in ('initial', 'emoji', 'photo') then
    raise exception 'Invalid avatar kind';
  end if;
  if p_color is null or p_color not in ('auto', 'pink', 'blue', 'green', 'orange', 'purple') then
    raise exception 'Invalid profile color';
  end if;
  if (p_avatar_kind = 'emoji' and p_avatar_emoji is null) or
     (p_avatar_emoji is not null and p_avatar_emoji not in (
       '🐷', '🐱', '🐶', '🐰', '🐻', '🐼', '🐸', '🐵',
       '🦊', '🐥', '🌻', '🌸', '🍓', '🥭', '⭐', '🌙'
     )) then
    raise exception 'Choose a supported emoji';
  end if;
  select avatar_url into photo from public.profiles where id = actor for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_avatar_kind = 'photo' and photo is null then
    raise exception 'Google photo required';
  end if;
  update public.profiles set nickname = nick, avatar_kind = p_avatar_kind,
    avatar_emoji = p_avatar_emoji, color = p_color where id = actor;
end $$;

-- Profiles retain their existing select-only RLS and table privileges.
-- private.profile_sync only names display_name/avatar_url/email, preserving these columns.
revoke execute on function public.update_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_profile(text, text, text, text) to authenticated;
