-- Row level security and RPC tests for supabase/migrations (run by scripts/test-migrations.sh on a
-- throwaway PostgreSQL with supabase/tests/stub_supabase.sql loaded). Every check raises an
-- exception on failure, psql runs with ON_ERROR_STOP=1, so the first failure fails the script.
--
-- Users act inside transactions: test.login() sets the JWT claims and switches to the
-- authenticated (or anon) role until the transaction ends.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema test;

create function test.login(p_email text) returns void language plpgsql as $$
declare
  v_id uuid;
begin
  if p_email is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.email', '', true);
    perform set_config('role', 'anon', true);
    return;
  end if;
  select id into strict v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform set_config('request.jwt.claim.email', p_email, true);
  perform set_config('role', 'authenticated', true);
end
$$;

create function test.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_msg;
  end if;
end
$$;

-- Runs p_sql and requires it to fail with an error whose message contains p_expected (or whose
-- SQLSTATE equals it).
create function test.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) > 0 or sqlstate = p_expected then
      return;
    end if;
    raise exception 'ASSERTION FAILED: [%] expected error "%", got "%" (%)', p_sql, p_expected, sqlerrm, sqlstate;
  end;
  raise exception 'ASSERTION FAILED: [%] expected error "%", but it succeeded', p_sql, p_expected;
end
$$;

-- Number of rows an insert/update/delete statement touched.
create function test.affected(p_sql text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$$;

grant usage on schema test to anon, authenticated;
grant execute on function test.assert(boolean, text), test.expect_error(text, text), test.affected(text)
  to anon, authenticated;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@example.com'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@example.com'),
  ('c0000000-0000-4000-8000-00000000000c', 'c@example.com'),
  ('d0000000-0000-4000-8000-00000000000d', 'd@example.com'),
  ('e0000000-0000-4000-8000-00000000000e', 'e@example.com');

-- ---------------------------------------------------------------------------------------------
\echo 'ok - setup'

begin;
select test.login('a@example.com');
do $$
declare
  r json;
begin
  r := public.create_org('  Sbor Alfa  ');
  perform test.assert(r ->> 'name' = 'Sbor Alfa', 'org name is trimmed: ' || r::text);
  perform test.assert(r ->> 'role' = 'admin', 'creator becomes admin');
  perform test.assert(
    (r ->> 'invite_code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$',
    'invite code format XXXX-XXXX: ' || coalesce(r ->> 'invite_code', 'null'));
  perform set_config('test.org_a', r ->> 'id', false);
  perform set_config('test.code_a', r ->> 'invite_code', false);
  perform test.expect_error($q$select public.create_org('Druhý sbor')$q$, 'already_member');
  r := public.my_org();
  perform test.assert(r ->> 'id' = current_setting('test.org_a') and r ->> 'role' = 'admin', 'my_org for A');
end
$$;
commit;
\echo 'ok - A creates an organisation and becomes admin'

begin;
select test.login('e@example.com');
do $$
begin
  perform test.expect_error($q$select public.create_org('   ')$q$, 'invalid_name');
  perform test.expect_error(format('select public.create_org(%L)', repeat('x', 121)), 'invalid_name');
  perform test.assert(public.my_org() is null, 'my_org is null without an organisation');
  perform test.assert((select count(*) from public.list_members()) = 0, 'no members without an organisation');
end
$$;
commit;
\echo 'ok - organisation name is validated, my_org() is null without membership'

begin;
select test.login('b@example.com');
do $$
declare
  r json;
begin
  -- lowercase and without the dash
  r := public.join_org(lower(replace(current_setting('test.code_a'), '-', '')));
  perform test.assert(r ->> 'id' = current_setting('test.org_a'), 'B joined org A: ' || r::text);
  perform test.assert(r ->> 'role' = 'member', 'joined users are members');
  perform test.expect_error(format('select public.join_org(%L)', current_setting('test.code_a')), 'already_member');
end
$$;
commit;

begin;
select test.login('d@example.com');
do $$
declare
  r json;
begin
  -- lowercase, with dash and surrounding spaces
  r := public.join_org('  ' || lower(current_setting('test.code_a')) || ' ');
  perform test.assert(r ->> 'id' = current_setting('test.org_a'), 'D joined org A');
end
$$;
commit;
\echo 'ok - B and D join with the invite code (case-insensitive, dash optional)'

begin;
select test.login('c@example.com');
do $$
declare
  r json;
begin
  perform test.expect_error($q$select public.join_org('IIII-LLLL')$q$, 'invalid_code');
  perform test.expect_error($q$select public.join_org('ABC')$q$, 'invalid_code');
  perform test.expect_error($q$select public.join_org('')$q$, 'invalid_code');
  perform test.expect_error($q$select public.join_org(null)$q$, 'invalid_code');
  r := public.create_org('Sbor Céčko');
  perform set_config('test.org_c', r ->> 'id', false);
end
$$;
commit;
\echo 'ok - a wrong invite code fails with invalid_code; C creates its own organisation'

-- ---------------------------------------------------------------------------------------------
-- Data visibility

begin;
select test.login('a@example.com');
insert into public.songs (org_id, id, title, content, updated_at, updated_by)
values (current_setting('test.org_a')::uuid, '5a000000-0000-4000-8000-000000000001', 'Svatý', '{title: Svatý}', now(), 'A-PC');
insert into public.plans (org_id, id, data, updated_at, updated_by)
values (current_setting('test.org_a')::uuid, '9a000000-0000-4000-8000-000000000001', '{"title": "Neděle"}', now(), 'A-PC');
commit;

begin;
select test.login('b@example.com');
insert into public.songs (org_id, id, title, content, updated_at, updated_by)
values (current_setting('test.org_a')::uuid, '5a000000-0000-4000-8000-000000000002', 'Chvála', '{title: Chvála}', now(), 'B-PC');
-- the upsert PostgREST sends for a push
insert into public.songs (org_id, id, title, content, updated_at, updated_by)
values (current_setting('test.org_a')::uuid, '5a000000-0000-4000-8000-000000000001', 'Svatý (B)', '{title: Svatý (B)}', now(), 'B-PC')
on conflict (org_id, id) do update
  set title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
commit;

begin;
select test.login('c@example.com');
insert into public.songs (org_id, id, title, content, updated_at, updated_by)
values (current_setting('test.org_c')::uuid, '5c000000-0000-4000-8000-000000000001', 'Jiný sbor', '', now(), 'C-PC');
-- the same song id in another organisation is a different row
insert into public.songs (org_id, id, title, content, updated_at, updated_by)
values (current_setting('test.org_c')::uuid, '5a000000-0000-4000-8000-000000000001', 'Stejné id', '', now(), 'C-PC');
commit;

begin;
select test.login('a@example.com');
do $$
begin
  perform test.assert((select count(*) from public.songs) = 2, 'A sees the 2 songs of org A');
  perform test.assert(
    (select title from public.songs where id = '5a000000-0000-4000-8000-000000000001') = 'Svatý (B)',
    'A sees B''s edit');
  perform test.assert((select count(*) from public.plans) = 1, 'A sees the plan');
  perform test.assert((select count(*) from public.orgs) = 1, 'A sees only its organisation');
  perform test.assert((select count(*) from public.org_members) = 3, 'A sees the 3 members of org A');
end
$$;
commit;

begin;
select test.login('b@example.com');
do $$
begin
  perform test.assert((select count(*) from public.songs) = 2, 'B sees the same 2 songs');
  perform test.assert(
    (select array_agg(id order by id) from public.songs)::text
      = '{5a000000-0000-4000-8000-000000000001,5a000000-0000-4000-8000-000000000002}',
    'B sees the same song ids as A');
  perform test.assert((select count(*) from public.plans) = 1, 'B sees the plan');
end
$$;
commit;

begin;
select test.login('c@example.com');
do $$
begin
  perform test.assert((select count(*) from public.songs) = 2, 'C sees only its own 2 songs');
  perform test.assert(
    (select count(*) from public.songs where org_id = current_setting('test.org_a')::uuid) = 0,
    'C sees none of org A''s songs');
  perform test.assert((select count(*) from public.plans) = 0, 'C sees no plans of org A');
  perform test.assert((select count(*) from public.orgs) = 1, 'C sees only its organisation');
  perform test.assert((select count(*) from public.org_members) = 1, 'C sees only its own membership');
  perform test.assert((select count(*) from public.list_members()) = 1, 'list_members for C');
  perform test.expect_error(
    format(
      'insert into public.songs (org_id, id, title, content, updated_at) values (%L, gen_random_uuid(), %L, %L, now())',
      current_setting('test.org_a'), 'Vetřelec', ''),
    'row-level security');
  perform test.expect_error(
    format(
      'insert into public.songs (org_id, id, title, updated_at) values (%L, %L, %L, now()) '
      'on conflict (org_id, id) do update set title = excluded.title',
      current_setting('test.org_a'), '5a000000-0000-4000-8000-000000000001', 'Přepsáno'),
    'row-level security');
  perform test.assert(
    test.affected(format('update public.songs set title = %L where org_id = %L', 'Hack', current_setting('test.org_a'))) = 0,
    'C cannot update songs of org A');
  perform test.assert(
    test.affected(format('update public.plans set data = %L where org_id = %L', '{}', current_setting('test.org_a'))) = 0,
    'C cannot update plans of org A');
  perform test.expect_error(
    format('insert into public.org_members (org_id, user_id) values (%L, auth.uid())', current_setting('test.org_a')),
    'permission denied');
  perform test.expect_error($q$insert into public.orgs (name, invite_code) values ('X', 'XXXX-XXXX')$q$, 'permission denied');
end
$$;
commit;
\echo 'ok - A and B see the same songs, C sees none of them and cannot write into org A'

begin;
select test.login('b@example.com');
do $$
begin
  perform test.expect_error(
    format('update public.songs set org_id = %L where id = %L', current_setting('test.org_c'), '5a000000-0000-4000-8000-000000000002'),
    'row-level security');
  perform test.expect_error($q$delete from public.songs$q$, 'permission denied');
  perform test.assert(test.affected($q$update public.orgs set name = 'Převzato'$q$) = 0, 'members cannot rename the org');
end
$$;
commit;

begin;
select test.login('a@example.com');
do $$
begin
  perform test.assert(test.affected($q$update public.orgs set name = 'Sbor Alfa a Omega'$q$) = 1, 'admins rename the org');
  perform test.expect_error($q$update public.orgs set invite_code = 'AAAA-AAAA'$q$, 'permission denied');
  perform test.assert((public.my_org() ->> 'name') = 'Sbor Alfa a Omega', 'renamed');
end
$$;
commit;
\echo 'ok - no moving rows between organisations, no hard deletes, only admins rename'

-- ---------------------------------------------------------------------------------------------
-- server_updated_at is the server's clock, never the client's

begin;
select test.login('a@example.com');
insert into public.songs (org_id, id, title, updated_at, server_updated_at)
values (current_setting('test.org_a')::uuid, '5a000000-0000-4000-8000-000000000003', 'Hodiny', '2000-01-01', '2000-01-01');
select set_config('test.sua', server_updated_at::text, false)
from public.songs where id = '5a000000-0000-4000-8000-000000000003';
commit;

begin;
select test.login('b@example.com');
update public.songs set title = 'Hodiny 2', server_updated_at = '2000-01-01'
where id = '5a000000-0000-4000-8000-000000000003';
do $$
declare
  v timestamptz;
begin
  select server_updated_at into v from public.songs where id = '5a000000-0000-4000-8000-000000000003';
  perform test.assert(current_setting('test.sua')::timestamptz > '2020-01-01', 'insert ignores client server_updated_at');
  perform test.assert(v > current_setting('test.sua')::timestamptz, 'server_updated_at increases on update');
end
$$;
commit;
\echo 'ok - server_updated_at is set by the trigger and changes on update'

-- ---------------------------------------------------------------------------------------------
-- Admin rules

begin;
select test.login('b@example.com');
do $$
begin
  perform test.expect_error($q$select public.rotate_invite_code()$q$, 'not_admin');
  perform test.expect_error(
    $q$select public.set_member_role('a0000000-0000-4000-8000-00000000000a', 'member')$q$, 'not_admin');
  perform test.expect_error($q$select public.remove_member('d0000000-0000-4000-8000-00000000000d')$q$, 'not_admin');
end
$$;
commit;
\echo 'ok - a member cannot rotate the invite code or manage members (not_admin)'

begin;
select test.login('a@example.com');
do $$
declare
  v_new text;
begin
  v_new := public.rotate_invite_code();
  perform test.assert(v_new <> current_setting('test.code_a'), 'rotate gives a new code');
  perform test.assert((public.my_org() ->> 'invite_code') = v_new, 'my_org shows the new code');
  perform set_config('test.old_code_a', current_setting('test.code_a'), false);
  perform set_config('test.code_a', v_new, false);

  perform test.expect_error($q$select public.leave_org()$q$, 'last_admin');
  perform test.expect_error(
    $q$select public.set_member_role('a0000000-0000-4000-8000-00000000000a', 'member')$q$, 'last_admin');
  perform test.expect_error($q$select public.remove_member('a0000000-0000-4000-8000-00000000000a')$q$, 'last_admin');
  perform test.expect_error(
    $q$select public.set_member_role('b0000000-0000-4000-8000-00000000000b', 'owner')$q$, 'invalid_role');
  perform test.expect_error(
    $q$select public.set_member_role('c0000000-0000-4000-8000-00000000000c', 'admin')$q$, 'not_member');
  perform test.expect_error($q$select public.remove_member('c0000000-0000-4000-8000-00000000000c')$q$, 'not_member');
  perform test.assert(
    (select array_agg(email order by email) from public.list_members())::text = '{a@example.com,b@example.com,d@example.com}',
    'list_members shows the 3 members');
  perform test.assert(
    (select role from public.list_members() limit 1) = 'admin', 'admins are listed first');
end
$$;
commit;

begin;
select test.login('e@example.com');
do $$
begin
  perform test.expect_error(format('select public.join_org(%L)', current_setting('test.old_code_a')), 'invalid_code');
end
$$;
commit;
\echo 'ok - rotate_invite_code invalidates the old code; the last admin cannot leave, be demoted or removed'

begin;
select test.login('a@example.com');
select public.remove_member('d0000000-0000-4000-8000-00000000000d');
select public.set_member_role('b0000000-0000-4000-8000-00000000000b', 'admin');
select public.leave_org();
commit;

begin;
select test.login('d@example.com');
do $$
begin
  perform test.assert(public.my_org() is null, 'removed member has no organisation');
  perform test.assert((select count(*) from public.songs) = 0, 'removed member sees no songs');
end
$$;
commit;

begin;
select test.login('b@example.com');
do $$
begin
  perform test.assert((public.my_org() ->> 'role') = 'admin', 'B was promoted to admin');
  perform test.assert((select count(*) from public.list_members()) = 1, 'only B is left in org A');
  perform test.assert((select count(*) from public.songs) = 3, 'B still has the library');
end
$$;
commit;

begin;
select test.login('c@example.com');
select public.leave_org();
commit;

do $$
begin
  perform test.assert(not exists (select 1 from public.orgs where id = current_setting('test.org_c')::uuid),
    'the organisation is deleted when its only member leaves');
  perform test.assert(not exists (select 1 from public.songs where org_id = current_setting('test.org_c')::uuid),
    'its songs are deleted too');
  perform test.assert(exists (select 1 from public.orgs where id = current_setting('test.org_a')::uuid), 'org A stays');
end
$$;
\echo 'ok - remove_member, set_member_role and leave_org (only member → organisation deleted)'

-- ---------------------------------------------------------------------------------------------
-- Anonymous access

begin;
select test.login(null);
do $$
begin
  perform test.assert(public.keepalive() is not null, 'anon can call keepalive()');
  perform test.expect_error($q$select count(*) from public.songs$q$, 'permission denied');
  perform test.expect_error($q$select count(*) from public.orgs$q$, 'permission denied');
  perform test.expect_error($q$select public.create_org('Anon')$q$, 'permission denied');
  perform test.expect_error($q$select public.my_org()$q$, 'permission denied');
end
$$;
commit;

begin;
select test.login('d@example.com');
do $$
begin
  perform test.assert(public.keepalive() is not null, 'authenticated can call keepalive()');
end
$$;
commit;
\echo 'ok - anon can call keepalive() but cannot read songs or call the RPCs'

-- ---------------------------------------------------------------------------------------------
-- Storage

do $$
begin
  perform test.assert(
    exists (select 1 from storage.buckets where id = 'media' and public = false and file_size_limit = 52428800),
    'private media bucket with a 50 MB limit');
end
$$;

-- C is now without an organisation; give it a new one for the storage checks.
begin;
select test.login('c@example.com');
select set_config('test.org_c2', public.create_org('Sbor Céčko 2') ->> 'id', false);
commit;

begin;
select test.login('b@example.com');
insert into storage.objects (bucket_id, name, owner)
values ('media', current_setting('test.org_a') || '/x.jpg', auth.uid());
commit;

begin;
select test.login('c@example.com');
do $$
begin
  perform test.expect_error(
    format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'media', current_setting('test.org_a') || '/y.jpg'),
    'row-level security');
  perform test.expect_error(
    $q$insert into storage.objects (bucket_id, name) values ('media', 'not-a-uuid/y.jpg')$q$, 'row-level security');
  perform test.expect_error(
    $q$insert into storage.objects (bucket_id, name) values ('media', 'root-file.jpg')$q$, 'row-level security');
  perform test.assert(
    test.affected(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'media',
      current_setting('test.org_c2') || '/own.jpg')) = 1,
    'C can upload into its own organisation folder');
  perform test.assert((select count(*) from storage.objects) = 1, 'C sees only its own object');
  perform test.assert(
    test.affected(format('delete from storage.objects where name = %L', current_setting('test.org_a') || '/x.jpg')) = 0,
    'C cannot delete files of org A');
  perform test.assert(
    test.affected(format('update storage.objects set name = %L where name = %L',
      current_setting('test.org_c2') || '/stolen.jpg', current_setting('test.org_a') || '/x.jpg')) = 0,
    'C cannot move files of org A');
end
$$;
commit;

begin;
select test.login('b@example.com');
do $$
begin
  perform test.assert(
    (select count(*) from storage.objects where name = current_setting('test.org_a') || '/x.jpg') = 1,
    'B sees the file of org A');
  perform test.assert(
    (select count(*) from storage.objects where name like current_setting('test.org_c2') || '/%') = 0,
    'B does not see files of org C');
  perform test.expect_error(
    format('update storage.objects set name = %L where name = %L',
      current_setting('test.org_c2') || '/moved.jpg', current_setting('test.org_a') || '/x.jpg'),
    'row-level security');
  perform test.assert(
    test.affected(format('delete from storage.objects where name = %L', current_setting('test.org_a') || '/x.jpg')) = 1,
    'B can delete files of org A');
end
$$;
commit;
\echo 'ok - storage: B can upload into the org A folder, C cannot'

\echo 'All RLS tests passed.'
