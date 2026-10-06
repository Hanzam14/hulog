-- Committed fixtures are required for independent database sessions.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','race-owner@hulog.test'),
 ('10000000-0000-0000-0000-000000000002','race-b@hulog.test'),
 ('10000000-0000-0000-0000-000000000003','race-c@hulog.test');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select create_group('Concurrent invite');
create temporary table race_token as select create_invite() as token;
create function private.test_claim(token text, actor uuid) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.claim_invite(token);
 perform pg_sleep(1);
 return 'claimed';
exception when others then return SQLERRM;
end $$;
revoke all on function private.test_claim(text,uuid) from public,anon,authenticated;
-- Use the server's network address (SCRAM), rather than loopback (trust).
-- dblink requires password authentication for the non-superuser postgres role.
select dblink_connect('b',format('dbname=postgres user=postgres password=postgres host=%s',inet_server_addr()));
select dblink_connect('c',format('dbname=postgres user=postgres password=postgres host=%s',inet_server_addr()));
select dblink_send_query('b',format('select private.test_claim(%L,%L::uuid)',(select token from race_token),'10000000-0000-0000-0000-000000000002'));
select dblink_send_query('c',format('select private.test_claim(%L,%L::uuid)',(select token from race_token),'10000000-0000-0000-0000-000000000003'));
create temporary table race_results(result text);
insert into race_results select * from dblink_get_result('b') as t(result text);
insert into race_results select * from dblink_get_result('c') as t(result text);
select plan(3);
select is((select count(*) from race_results where result='claimed'),1::bigint,'Exactly one concurrent invite claim succeeds');
select is((select count(*) from race_results where result='Invite invalid or used'),1::bigint,'Other concurrent claim fails');
select is((select count(*) from memberships where user_id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003')),1::bigint,'Exactly one pending membership created');
select * from finish();
select dblink_disconnect('b'); select dblink_disconnect('c');
drop function private.test_claim(text,uuid);
delete from history where group_id in (select id from groups where owner_id='10000000-0000-0000-0000-000000000001');
delete from invites where group_id in (select id from groups where owner_id='10000000-0000-0000-0000-000000000001');
delete from memberships where group_id in (select id from groups where owner_id='10000000-0000-0000-0000-000000000001');
-- Membership deletion is audited, so clear that final row too.
delete from history where group_id in (select id from groups where owner_id='10000000-0000-0000-0000-000000000001');
delete from groups where owner_id='10000000-0000-0000-0000-000000000001';
delete from profiles where id::text like '10000000-%';
delete from auth.users where id::text like '10000000-%';
