-- Idempotent record_payment / record_abono_entry (SPEC 10.11).
-- Committed fixtures are required: the race cases run in independent database
-- sessions through dblink, exactly like concurrency.test.sql. The test uses the
-- real clock (dates are relative to hulog_today()) and deletes everything at
-- the end.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions, pg_temp;
select plan(61);

insert into auth.users(id,email,raw_user_meta_data) values
 ('73000000-0000-0000-0000-000000000001','idem-a@hulog.test','{"full_name":"Ana"}'),
 ('73000000-0000-0000-0000-000000000002','idem-b@hulog.test','{"full_name":"Bea"}'),
 ('73000000-0000-0000-0000-000000000003','idem-c@hulog.test','{"full_name":"Cai"}');
insert into groups(id,name,owner_id) values ('73000000-0000-0000-0000-0000000000a0','Idem','73000000-0000-0000-0000-000000000001');
insert into memberships(group_id,user_id,status) values
 ('73000000-0000-0000-0000-0000000000a0','73000000-0000-0000-0000-000000000001','active'),
 ('73000000-0000-0000-0000-0000000000a0','73000000-0000-0000-0000-000000000002','active');
insert into wallets(id,group_id,holder_id,label,created_by) values
 ('73000000-0000-0000-0000-0000000000b0','73000000-0000-0000-0000-0000000000a0','73000000-0000-0000-0000-000000000001','Maya','73000000-0000-0000-0000-000000000001');
create temporary table fixture(key text primary key,val text);
grant all on fixture to authenticated,anon;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-'||lpad(n::text,12,'0'),false)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$select val::uuid from fixture where key=k$$;
create function pg_temp.k(n integer) returns uuid language sql as $$select ('b1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.cy(n integer) returns uuid language sql as $$select ('73000000-0000-0000-0000-0000000000c'||n::text)::uuid$$;
create function pg_temp.u(n integer) returns uuid language sql as $$select ('73000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
-- c1 open, c2 closed long ago, c3 open on its last day, c4..c7 open for the races.
insert into cycles(id,group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status,accepted_at,wallet_id)
select pg_temp.cy(n),'73000000-0000-0000-0000-0000000000a0',5000,15,hulog_today()+off,hulog_today()+off+14,
 '73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001','accepted',now(),'73000000-0000-0000-0000-0000000000b0'
from (values (1,-3),(2,-40),(3,-14),(4,-3),(5,-3),(6,-3),(7,-3)) v(n,off);
grant select on cycles to authenticated;

-- Structure and grants (as the table owner).
select has_column('public','payments','client_request_id','payments has client_request_id');
select has_column('public','abono_entries','client_request_id','abono_entries has client_request_id');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='payments' and indexdef ilike 'create unique index%(created_by, client_request_id) where%'),'Unique partial index on payments (created_by, client_request_id)');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='abono_entries' and indexdef ilike 'create unique index%(created_by, client_request_id) where%'),'Unique partial index on abono_entries (created_by, client_request_id)');
select hasnt_function('public','record_payment',array['uuid','integer','text'],'Old 3-argument record_payment signature is gone');
select ok(not has_function_privilege('anon','public.record_payment(uuid,integer,text,uuid)','execute'),'Anon cannot execute keyed record_payment');
select ok(not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute'),'Anon cannot execute keyed record_abono_entry');
select ok(not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute'),'Anon cannot execute the 8-argument record_abono_entry');
select ok(has_function_privilege('authenticated','public.record_payment(uuid,integer,text,uuid)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute'),'Authenticated can execute the replaced and new signatures');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid in ('public.record_payment(uuid,integer,text,uuid)'::regprocedure,
  'public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)'::regprocedure,
  'public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)'::regprocedure) and a.grantee=0),'PUBLIC has no execute on any of them');
select ok(has_function_privilege('authenticated','public.record_payment(uuid,integer)','execute')
 and not has_function_privilege('anon','public.record_payment(uuid,integer)','execute'),'2-argument record_payment keeps its grants');

set role authenticated;
-- Payments. Ana (1) and Bea (2) are members; Cai (3) is an outsider.
select pg_temp.actor(1);
insert into fixture values('p1',record_payment(pg_temp.cy(1),3,'first',pg_temp.k(1))::text);
select is((select (created_by,member_id,days,amount_centavos,status,client_request_id)::text from payments where id=pg_temp.id('p1')),
 format('(%s,%s,3,15000,pending,%s)',pg_temp.u(1),pg_temp.u(1),pg_temp.k(1)),'First call records the payment with its key, actor and amount');
select is(record_payment(pg_temp.cy(1),3,'first',pg_temp.k(1)),pg_temp.id('p1'),'Same key again returns the same payment id');
select is((select count(*) from payments where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(1)),1::bigint,'Same key again inserts no second row');
select is(record_payment(pg_temp.cy(1),5,'other',pg_temp.k(1)),pg_temp.id('p1'),'A replay returns the original row even if the arguments differ');
select is((select days from payments where id=pg_temp.id('p1')),3,'A replay leaves the stored row unchanged');
select pg_temp.actor(2);
insert into fixture values('p2',record_payment(pg_temp.cy(1),2,'',pg_temp.k(1))::text);
select isnt(pg_temp.id('p2'),pg_temp.id('p1'),'Another user with the same key gets a separate payment');
select is((select count(*) from payments where client_request_id=pg_temp.k(1)),2::bigint,'Both users keep their own row for the shared key');
select pg_temp.actor(1);
insert into fixture values('p3',record_payment(pg_temp.cy(1),1)::text);
select ok((select client_request_id is null and days=1 from payments where id=pg_temp.id('p3')),'The 2-argument form still records, with no key');
select lives_ok($$select record_payment(pg_temp.cy(1),1,'note3')$$,'The 3-argument call shape still works with no key');
select is((select count(*) from payments where created_by=pg_temp.u(1) and cycle_id=pg_temp.cy(1) and client_request_id is null),2::bigint,'Calls without a key are never deduplicated');
select throws_ok($$select record_payment(pg_temp.cy(1),11,'',pg_temp.k(2))$$,'P0001','Payment days exceed cap or are invalid','The day cap is enforced on the first insert');
select is((select count(*) from payments where client_request_id=pg_temp.k(2)),0::bigint,'A rejected request leaves no row for its key');
insert into fixture values('p4',record_payment(pg_temp.cy(1),10,'',pg_temp.k(3))::text);
select is((select days from payments where id=pg_temp.id('p4')),10,'A request that reaches the cap exactly is recorded');
select is(record_payment(pg_temp.cy(1),10,'',pg_temp.k(3)),pg_temp.id('p4'),'Its replay returns the same id even though the cap is now full');
select throws_ok($$select record_payment(pg_temp.cy(1),1,'',pg_temp.k(4))$$,'P0001','Payment days exceed cap or are invalid','A new key is still stopped by the full cap');
select throws_ok($$select record_payment(pg_temp.cy(2),1,'',pg_temp.k(1))$$,'P0001','Request id already used','A key already used on another cycle is refused');
select throws_ok($$select record_payment(pg_temp.cy(2),1,'',pg_temp.k(5))$$,'P0001','Payment window closed','A closed cycle rejects a new keyed request at sync time');
insert into fixture values('p5',record_payment(pg_temp.cy(3),1,'',pg_temp.k(6))::text);
select is((select cycle_id from payments where id=pg_temp.id('p5')),pg_temp.cy(3),'A last-day payment is recorded');
reset role;
-- Simulate the sync arriving after the window closed.
update cycles set end_date=hulog_today()-1 where id=pg_temp.cy(3);
set role authenticated;
select is(record_payment(pg_temp.cy(3),1,'',pg_temp.k(6)),pg_temp.id('p5'),'The replay of an already recorded request still returns it after the window closed');
select throws_ok($$select record_payment(pg_temp.cy(3),1,'',pg_temp.k(7))$$,'P0001','Payment window closed','A new request on the now-closed cycle is judged by the server date');
select pg_temp.actor(3);
select throws_ok($$select record_payment(pg_temp.cy(1),1,'',pg_temp.k(8))$$,'P0001','Active membership required','An outsider cannot record, key or not');
select pg_temp.actor(1);
reset role;
update payments set deleted_at=now() where id=pg_temp.id('p5');
set role authenticated;
select is(record_payment(pg_temp.cy(3),1,'',pg_temp.k(6)),pg_temp.id('p5'),'A soft-deleted payment is still the answer to its key');
select is((select count(*) from payments where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(6)),1::bigint,'The late retry did not bring the deleted payment back');
set role anon;
select throws_ok($$select record_payment(pg_temp.cy(1),1,'',pg_temp.k(9))$$,'42501',null,'Anon cannot call keyed record_payment');
select throws_ok($$select record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Anon',100,100,null,'',pg_temp.k(9))$$,'42501',null,'Anon cannot call keyed record_abono_entry');
set role authenticated;

-- Abono entries. Ana paid, Bea owes half.
select pg_temp.actor(1);
insert into fixture values('e1',record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Groceries',100000,50000,null,'shared',pg_temp.k(21))::text);
select is((select (created_by,group_id,kind,status,owed_amount_centavos,client_request_id)::text from abono_entries where id=pg_temp.id('e1')),
 format('(%s,73000000-0000-0000-0000-0000000000a0,expense,pending,50000,%s)',pg_temp.u(1),pg_temp.k(21)),'First call records the entry with its key and actor');
select is(record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Groceries',100000,50000,null,'shared',pg_temp.k(21)),pg_temp.id('e1'),'Same key again returns the same entry id');
select is((select count(*) from abono_entries where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(21)),1::bigint,'Same key again inserts no second entry');
select is(record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Changed',999,999,null,'',pg_temp.k(21)),pg_temp.id('e1'),'A replay returns the original entry even if the arguments differ');
select is((select total_amount_centavos from abono_entries where id=pg_temp.id('e1')),100000::bigint,'A replay leaves the stored entry unchanged');
select pg_temp.actor(2);
insert into fixture values('e2',record_abono_entry('expense',pg_temp.u(2),pg_temp.u(1),'Dinner',30000,15000,null,'',pg_temp.k(21))::text);
select isnt(pg_temp.id('e2'),pg_temp.id('e1'),'Another user with the same key gets a separate entry');
select throws_ok($$select record_abono_entry('settlement',pg_temp.u(2),pg_temp.u(1),'Settlement',100,100,null,'',pg_temp.k(22))$$,'P0001','Settlement exceeds owed balance','The settlement cap is enforced on the first insert');
select is((select count(*) from abono_entries where client_request_id=pg_temp.k(22)),0::bigint,'A rejected settlement leaves no row for its key');
select pg_temp.actor(1);
insert into fixture values('e3',record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Plain',20000,10000)::text);
select ok((select client_request_id is null from abono_entries where id=pg_temp.id('e3')),'The 8-argument form still records, with no key');
select throws_ok($$select record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Future',100,100,hulog_today()+1,'',pg_temp.k(23))$$,'P0001','Entry date cannot be in the future','A new request is checked against the server date');
select pg_temp.actor(3);
select throws_ok($$select record_abono_entry('expense',pg_temp.u(1),pg_temp.u(2),'Outsider',100,100,null,'',pg_temp.k(24))$$,'P0001','Active membership required','An outsider cannot record, key or not');
select pg_temp.actor(2);
select lives_ok($$select confirm_abono_entry(pg_temp.id('e1'))$$,'Bea confirms Ana''s expense, so Bea owes Ana 50000');
insert into fixture values('s1',record_abono_entry('settlement',pg_temp.u(2),pg_temp.u(1),'Settlement',50000,50000,null,'',pg_temp.k(25))::text);
select is((select status from abono_entries where id=pg_temp.id('s1')),'pending','A settlement within the confirmed balance is recorded as pending');
select is(record_abono_entry('settlement',pg_temp.u(2),pg_temp.u(1),'Settlement',50000,50000,null,'',pg_temp.k(25)),pg_temp.id('s1'),'Its replay returns the same id although the pending settlement now fills the balance');
select throws_ok($$select record_abono_entry('settlement',pg_temp.u(2),pg_temp.u(1),'Settlement',1,1,null,'',pg_temp.k(26))$$,'P0001','Settlement exceeds owed balance','A new key is still stopped by the pending settlement');
reset role;

-- A replay never writes: only the original insert is in the audit trail.
select is((select count(*) from history where entity='payments' and entity_id=pg_temp.id('p1')),1::bigint,'The payment replays added no history rows');
select is((select count(*) from history where entity='abono_entries' and entity_id=pg_temp.id('e2')),1::bigint,'The entry replay added no history rows');

-- Races in independent sessions. The first session keeps its transaction open
-- (pg_sleep inside the function) so the second one meets the uncommitted state.
create function private.test_idem_pay(actor uuid,cid uuid,d integer,k uuid,hold numeric) returns text language plpgsql as $$
declare r uuid;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 r:=public.record_payment(cid,d,'',k);
 perform pg_sleep(hold);
 return r::text;
exception when others then return 'ERR:'||SQLERRM;
end $$;
create function private.test_idem_abono(actor uuid,k uuid,hold numeric) returns text language plpgsql as $$
declare r uuid;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 r:=public.record_abono_entry('expense',actor,'73000000-0000-0000-0000-000000000002','Race',2000,1000,null,'',k);
 perform pg_sleep(hold);
 return r::text;
exception when others then return 'ERR:'||SQLERRM;
end $$;
revoke all on function private.test_idem_pay(uuid,uuid,integer,uuid,numeric),private.test_idem_abono(uuid,uuid,numeric) from public,anon,authenticated;
create function pg_temp.race(q_first text,q_second text) returns text[] language plpgsql as $$
declare cs text:=format('dbname=postgres user=postgres password=postgres host=%s',inet_server_addr()); r1 text; r2 text;
begin
 perform dblink_connect('race_b',cs);
 perform dblink_connect('race_c',cs);
 perform dblink_send_query('race_b',q_first);
 perform pg_sleep(1);
 perform dblink_send_query('race_c',q_second);
 select result into r1 from dblink_get_result('race_b') as t(result text);
 select result into r2 from dblink_get_result('race_c') as t(result text);
 perform dblink_disconnect('race_b');
 perform dblink_disconnect('race_c');
 return array[r1,r2];
end $$;
create temporary table race_results(name text primary key,r text[]);

-- 1. Same key, same cycle: the second session waits on the cycle lock, then replays.
insert into race_results select 'same_key',pg_temp.race(
 format('select private.test_idem_pay(%L,%L,1,%L,2)',pg_temp.u(1),pg_temp.cy(4),pg_temp.k(31)),
 format('select private.test_idem_pay(%L,%L,1,%L,0)',pg_temp.u(1),pg_temp.cy(4),pg_temp.k(31)));
select ok((select r[1]=r[2] and r[1] not like 'ERR:%' from race_results where name='same_key'),'Concurrent payments with one key return the same id');
select is((select count(*) from payments where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(31)),1::bigint,'Concurrent payments with one key leave exactly one row');

-- 2. Same key, abono: the second session waits on the group lock, then replays.
insert into race_results select 'abono_same_key',pg_temp.race(
 format('select private.test_idem_abono(%L,%L,2)',pg_temp.u(1),pg_temp.k(32)),
 format('select private.test_idem_abono(%L,%L,0)',pg_temp.u(1),pg_temp.k(32)));
select ok((select r[1]=r[2] and r[1] not like 'ERR:%' from race_results where name='abono_same_key'),'Concurrent abono entries with one key return the same id');
select is((select count(*) from abono_entries where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(32)),1::bigint,'Concurrent abono entries with one key leave exactly one row');

-- 3. Two different keys racing for the last days: the cap holds under the lock.
insert into race_results select 'cap',pg_temp.race(
 format('select private.test_idem_pay(%L,%L,10,%L,2)',pg_temp.u(2),pg_temp.cy(5),pg_temp.k(33)),
 format('select private.test_idem_pay(%L,%L,10,%L,0)',pg_temp.u(2),pg_temp.cy(5),pg_temp.k(34)));
select ok((select r[1] not like 'ERR:%' and r[2]='ERR:Payment days exceed cap or are invalid' from race_results where name='cap'),'Two racing 10-day requests for a 15-day cap: one wins, one is refused');
select is((select sum(days) from payments where cycle_id=pg_temp.cy(5) and member_id=pg_temp.u(2) and deleted_at is null),10::bigint,'Only the winning 10 days were recorded');

-- 4. Same key through two different cycles: the key index catches the second.
insert into race_results select 'cross_cycle',pg_temp.race(
 format('select private.test_idem_pay(%L,%L,1,%L,2)',pg_temp.u(1),pg_temp.cy(6),pg_temp.k(35)),
 format('select private.test_idem_pay(%L,%L,1,%L,0)',pg_temp.u(1),pg_temp.cy(7),pg_temp.k(35)));
select ok((select r[1] not like 'ERR:%' and r[2]='ERR:Request id already used' from race_results where name='cross_cycle'),'One key racing through two cycles records once and refuses the other');
select is((select count(*) from payments where created_by=pg_temp.u(1) and client_request_id=pg_temp.k(35)),1::bigint,'The cross-cycle race left exactly one row');

select * from finish();

-- Cleanup of the committed fixtures.
drop function private.test_idem_pay(uuid,uuid,integer,uuid,numeric);
drop function private.test_idem_abono(uuid,uuid,numeric);
delete from history where group_id='73000000-0000-0000-0000-0000000000a0';
delete from payments where cycle_id in (select id from cycles where group_id='73000000-0000-0000-0000-0000000000a0');
delete from abono_entries where group_id='73000000-0000-0000-0000-0000000000a0';
delete from cycles where group_id='73000000-0000-0000-0000-0000000000a0';
delete from wallets where group_id='73000000-0000-0000-0000-0000000000a0';
delete from memberships where group_id='73000000-0000-0000-0000-0000000000a0';
-- Membership deletion is audited, so clear that last history row too.
delete from history where group_id='73000000-0000-0000-0000-0000000000a0';
delete from groups where id='73000000-0000-0000-0000-0000000000a0';
delete from profiles where id::text like '73000000-%';
delete from auth.users where id::text like '73000000-%';