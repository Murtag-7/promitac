-- Promítač – initial schema
--
-- Organisation ("sbor") → members, the shared library (songs, plans, themes, media metadata) and
-- media files in Storage. Every row belongs to an organisation and row level security makes sure
-- a signed-in user only ever sees the data of their own organisation.
--
-- Run it once in the Supabase SQL editor (or `supabase db push`). It is safe to run again.

-- ---------------------------------------------------------------------------------------------
-- Organisations and members
-- ---------------------------------------------------------------------------------------------

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  invite_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  email text,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id),
  -- v1: one organisation per user
  constraint org_members_one_org_per_user unique (user_id)
);

-- ---------------------------------------------------------------------------------------------
-- Shared library. `updated_at` comes from the computer that made the edit (last-write-wins),
-- `server_updated_at` is set by the server and used as the pull cursor, so syncing never depends
-- on the clocks of the computers. Deletions are soft (`deleted = true`) so they sync too.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.songs (
  org_id uuid not null references public.orgs (id) on delete cascade,
  id uuid not null,
  title text not null default '',
  content text not null default '',
  updated_at timestamptz not null,
  deleted boolean not null default false,
  updated_by text,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (org_id, id)
);

create table if not exists public.plans (
  org_id uuid not null references public.orgs (id) on delete cascade,
  id uuid not null,
  data jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  updated_by text,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (org_id, id)
);

create table if not exists public.themes (
  org_id uuid not null references public.orgs (id) on delete cascade,
  id uuid not null,
  data jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  updated_by text,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (org_id, id)
);

create table if not exists public.media (
  org_id uuid not null references public.orgs (id) on delete cascade,
  id uuid not null,
  data jsonb,
  storage_path text,
  size bigint,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  updated_by text,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (org_id, id)
);

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- clock_timestamp(), not now(): rows written later in the same transaction get later values.
  new.server_updated_at := clock_timestamp();
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Helper functions (security definer: they read org_members without being subject to its RLS,
-- which also avoids recursive policies).
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'admin'
  )
$$;

-- Storage paths are "<org_id>/<file>"; compares as text so a malformed path is simply denied.
create or replace function public.is_org_member_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m where m.user_id = auth.uid() and m.org_id::text = p_folder
  )
$$;

-- 8 characters, no look-alikes (no I, L, O, 0, 1), shown as XXXX-XXXX.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      -- gen_random_uuid() uses the strong random source; byte 0 is fully random.
      v_code := v_code || substr(alphabet, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet), 1);
      if i = 4 then
        v_code := v_code || '-';
      end if;
    end loop;
    exit when not exists (select 1 from public.orgs o where o.invite_code = v_code);
  end loop;
  return v_code;
end
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select u.email::text from auth.users u where u.id = auth.uid())
  )
$$;

create or replace function public.current_user_display_name()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(trim(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'display_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    ''
  )), '')
$$;

-- ---------------------------------------------------------------------------------------------
-- RPCs used by the app. Errors are raised with a short code as the message
-- (already_member, invalid_code, not_admin, last_admin, not_member, invalid_name, invalid_role,
-- not_authenticated) which the app translates to Czech.
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_org(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_org public.orgs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_uid) then
    raise exception 'already_member';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'invalid_name';
  end if;

  insert into public.orgs (name, invite_code, created_by)
  values (v_name, public.generate_invite_code(), v_uid)
  returning * into v_org;

  begin
    insert into public.org_members (org_id, user_id, role, email, display_name)
    values (v_org.id, v_uid, 'admin', public.current_user_email(), public.current_user_display_name());
  exception when unique_violation then
    raise exception 'already_member';
  end;

  return json_build_object('id', v_org.id, 'name', v_org.name, 'role', 'admin', 'invite_code', v_org.invite_code);
end
$$;

create or replace function public.join_org(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  -- case-insensitive, ignores spaces and the dash: "abcd efgh", "ABCD-EFGH", "abcdefgh"
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_org public.orgs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_uid) then
    raise exception 'already_member';
  end if;
  if length(v_norm) <> 8 then
    raise exception 'invalid_code';
  end if;

  select * into v_org from public.orgs o
  where o.invite_code = substr(v_norm, 1, 4) || '-' || substr(v_norm, 5, 4);
  if not found then
    raise exception 'invalid_code';
  end if;

  begin
    insert into public.org_members (org_id, user_id, role, email, display_name)
    values (v_org.id, v_uid, 'member', public.current_user_email(), public.current_user_display_name());
  exception when unique_violation then
    raise exception 'already_member';
  end;

  return json_build_object('id', v_org.id, 'name', v_org.name, 'role', 'member', 'invite_code', v_org.invite_code);
end
$$;

create or replace function public.my_org()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('id', o.id, 'name', o.name, 'role', m.role, 'invite_code', o.invite_code)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  where m.user_id = auth.uid()
$$;

create or replace function public.list_members()
returns table (user_id uuid, email text, role text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.email, m.role, m.display_name
  from public.org_members m
  where m.org_id = (select me.org_id from public.org_members me where me.user_id = auth.uid())
  order by (m.role = 'admin') desc, lower(coalesce(m.display_name, m.email, '')), m.joined_at
$$;

create or replace function public.rotate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text;
  v_code text;
begin
  select m.org_id, m.role into v_org, v_role from public.org_members m where m.user_id = auth.uid();
  if v_org is null then
    raise exception 'not_member';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_admin';
  end if;
  v_code := public.generate_invite_code();
  update public.orgs set invite_code = v_code where id = v_org;
  return v_code;
end
$$;

create or replace function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text;
  v_target_role text;
begin
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;
  select m.org_id, m.role into v_org, v_role from public.org_members m where m.user_id = auth.uid();
  if v_org is null then
    raise exception 'not_member';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_admin';
  end if;
  -- Serialise admin changes per organisation (two admins demoting each other at once).
  perform 1 from public.orgs where id = v_org for update;

  select m.role into v_target_role from public.org_members m where m.org_id = v_org and m.user_id = p_user;
  if v_target_role is null then
    raise exception 'not_member';
  end if;
  if v_target_role = 'admin' and p_role = 'member'
     and (select count(*) from public.org_members m where m.org_id = v_org and m.role = 'admin') <= 1 then
    raise exception 'last_admin';
  end if;
  update public.org_members set role = p_role where org_id = v_org and user_id = p_user;
end
$$;

create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text;
  v_target_role text;
begin
  select m.org_id, m.role into v_org, v_role from public.org_members m where m.user_id = auth.uid();
  if v_org is null then
    raise exception 'not_member';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_admin';
  end if;
  perform 1 from public.orgs where id = v_org for update;

  select m.role into v_target_role from public.org_members m where m.org_id = v_org and m.user_id = p_user;
  if v_target_role is null then
    raise exception 'not_member';
  end if;
  if v_target_role = 'admin'
     and (select count(*) from public.org_members m where m.org_id = v_org and m.role = 'admin') <= 1 then
    raise exception 'last_admin';
  end if;
  delete from public.org_members where org_id = v_org and user_id = p_user;
end
$$;

create or replace function public.leave_org()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
begin
  select m.org_id, m.role into v_org, v_role from public.org_members m where m.user_id = v_uid;
  if v_org is null then
    raise exception 'not_member';
  end if;
  perform 1 from public.orgs where id = v_org for update;

  if (select count(*) from public.org_members m where m.org_id = v_org) = 1 then
    -- The last member leaves: the organisation and its shared library are removed.
    -- (Files in Storage are not deleted by SQL; the app removes them through the Storage API.)
    delete from public.orgs where id = v_org;
    return;
  end if;
  if v_role = 'admin'
     and (select count(*) from public.org_members m where m.org_id = v_org and m.role = 'admin') <= 1 then
    raise exception 'last_admin';
  end if;
  delete from public.org_members where org_id = v_org and user_id = v_uid;
end
$$;

-- Pinged daily by the GitHub Actions keepalive workflow so the free project is not paused.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
as $$
  select now()
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges. Supabase grants everything to anon/authenticated by default; RLS below is the real
-- guard, these grants are defence in depth (no anonymous access, no hard deletes).
-- ---------------------------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

revoke all on table public.orgs, public.org_members, public.songs, public.plans, public.themes, public.media
  from anon, authenticated;
grant select on table public.orgs to authenticated;
grant update (name) on table public.orgs to authenticated;
grant select on table public.org_members to authenticated;
grant select, insert, update on table public.songs, public.plans, public.themes, public.media to authenticated;

revoke all on function public.set_server_updated_at() from public, anon, authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;
revoke all on function public.current_user_email() from public, anon, authenticated;
revoke all on function public.current_user_display_name() from public, anon, authenticated;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_member_folder(text) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_member_folder(text) to authenticated;

revoke all on function public.create_org(text) from public, anon;
revoke all on function public.join_org(text) from public, anon;
revoke all on function public.my_org() from public, anon;
revoke all on function public.list_members() from public, anon;
revoke all on function public.rotate_invite_code() from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.leave_org() from public, anon;
grant execute on function public.create_org(text) to authenticated;
grant execute on function public.join_org(text) to authenticated;
grant execute on function public.my_org() to authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.rotate_invite_code() to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.leave_org() to authenticated;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;

drop policy if exists orgs_select_member on public.orgs;
create policy orgs_select_member on public.orgs
  for select to authenticated
  using (public.is_org_member(id));

drop policy if exists orgs_update_admin on public.orgs;
create policy orgs_update_admin on public.orgs
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- No insert/delete policies: organisations and memberships change only through the RPCs above.
drop policy if exists org_members_select_member on public.org_members;
create policy org_members_select_member on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id));

-- Data tables: members read and write their organisation's rows; no delete (soft delete only).
do $$
declare
  t text;
begin
  foreach t in array array['songs', 'plans', 'themes', 'media'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_member', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_org_member(org_id))',
      t || '_select_member', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_member', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_org_member(org_id))',
      t || '_insert_member', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_member', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
      t || '_update_member', t);

    execute format(
      'create or replace trigger %I before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at()',
      t || '_set_server_updated_at', t);

    execute format(
      'create index if not exists %I on public.%I (org_id, server_updated_at)',
      t || '_org_server_updated_at_idx', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Storage: private bucket "media", files stored as "<org_id>/<media id>-<file name>".
-- 50 MB per file (Supabase free tier limit); bigger videos stay on the computer only.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists promitac_media_select on storage.objects;
create policy promitac_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_org_member_folder((storage.foldername(name))[1]));

drop policy if exists promitac_media_insert on storage.objects;
create policy promitac_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_org_member_folder((storage.foldername(name))[1]));

drop policy if exists promitac_media_update on storage.objects;
create policy promitac_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_org_member_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'media' and public.is_org_member_folder((storage.foldername(name))[1]));

drop policy if exists promitac_media_delete on storage.objects;
create policy promitac_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_org_member_folder((storage.foldername(name))[1]));
