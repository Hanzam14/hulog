-- Custom abono split (SPEC 10.15): an expense share may be 0 up to the total.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select plan(41);
insert into auth.users(id,email,raw_user_meta_data) values
 ('75000000-0000-0000-0000-000000000001','split-a@hulog.test','{"full_name":"Ana"}'),
 ('75000000-0000-0000-0000-000000000002','split-b@hulog.test','{"full_name":"Bea"}'),
 ('75000000-0000-0000-0000-000000000003','split-c@hulog.test','{"full_name":"Cai"}');
insert into groups(id,name,owner_id) values ('75000000-0000-0000-0000-0000000000a0','Split','75000000-0000-0000-0000-000000000001');
insert into memberships(group_id,user_id,status) values
 ('75000000-0000-0000-0000-0000000000a0','75000000-0000-0000-0000-000000000001','active'),
 ('75000000-0000-0000-0000-0000000000a0','75000000-0000-0000-0000-000000000002','active');
create temporary table fixture(key text primary key,val text);
grant all on fixture to authenticated,anon;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$select val::uuid from fixture where key=k$$;

-- Structure and grants (as the table owner).
select ok(exists(select 1 from pg_constraint where conrelid='public.abono_entries'::regclass and conname='abono_entries_split_check'),'The split check constraint exists');
select ok(not exists(select 1 from pg_constraint where conrelid='public.abono_entries'::regclass and conname='abono_entries_check'),'The old owed > 0 check is gone');
select ok(not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)','execute')
 and not has_function_privilege('anon','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)','execute')
 and not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute')
 and not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute')
 and not has_function_privilege('anon','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean)','execute'),'Anon still cannot execute any record or edit abono signature');
select ok(has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)','execute')
 and has_function_privilege('authenticated','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute')
 and has_function_privilege('authenticated','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean)','execute'),'Authenticated still can');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid in ('public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)'::regprocedure,
  'public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)'::regprocedure) and a.grantee=0),'PUBLIC has no execute on the replaced functions');
-- Table check on direct writes.
select throws_ok($$insert into abono_entries(group_id,kind,from_member,to_member,description,total_amount_centavos,owed_amount_centavos,entry_date,created_by,status,was_confirmed)
 values('75000000-0000-0000-0000-0000000000a0','expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','x',100,-1,hulog_today(),'75000000-0000-0000-0000-000000000001','pending',false)$$,'23514',null,'The table rejects a negative share');
select throws_ok($$insert into abono_entries(group_id,kind,from_member,to_member,description,total_amount_centavos,owed_amount_centavos,entry_date,created_by,status,was_confirmed)
 values('75000000-0000-0000-0000-0000000000a0','expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','x',100,101,hulog_today(),'75000000-0000-0000-0000-000000000001','pending',false)$$,'23514',null,'The table rejects a share above the total');
select throws_ok($$insert into abono_entries(group_id,kind,from_member,to_member,description,total_amount_centavos,owed_amount_centavos,entry_date,created_by,status,was_confirmed)
 values('75000000-0000-0000-0000-0000000000a0','settlement','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','x',100,0,hulog_today(),'75000000-0000-0000-0000-000000000001','pending',false)$$,'23514',null,'The table rejects a settlement whose total differs from its amount');
select throws_ok($$insert into abono_entries(group_id,kind,from_member,to_member,description,total_amount_centavos,owed_amount_centavos,entry_date,created_by,status,was_confirmed)
 values('75000000-0000-0000-0000-0000000000a0','expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','x',0,0,hulog_today(),'75000000-0000-0000-0000-000000000001','pending',false)$$,'23514',null,'The table still rejects a zero total');

set local role authenticated;
select pg_temp.actor(1);
-- Share values: 0, a split, the whole total.
insert into fixture values('zero',record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','All mine',24500,0,hulog_today(),'')::text);
select is((select owed_amount_centavos from abono_entries where id=pg_temp.id('zero')),0::bigint,'A zero share is recorded');
select is((select status from abono_entries where id=pg_temp.id('zero')),'pending','A zero-share entry still waits for the partner');
insert into fixture values('split',record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Odd split',10001,3300,hulog_today(),'')::text);
select is((select (total_amount_centavos,owed_amount_centavos)::text from abono_entries where id=pg_temp.id('split')),'(10001,3300)','An uneven centavo split is stored exactly');
insert into fixture values('whole',record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','All theirs',5000,5000,hulog_today(),'')::text);
select is((select owed_amount_centavos from abono_entries where id=pg_temp.id('whole')),5000::bigint,'A share equal to the total is recorded');
select throws_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Over',5000,5001,hulog_today(),'')$$,'P0001','Owed amount must be 0 or more and not exceed total amount','A share above the total is rejected');
select throws_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Negative',5000,-1,hulog_today(),'')$$,'P0001','Owed amount must be 0 or more and not exceed total amount','A negative share is rejected');
select throws_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Null',5000,null,hulog_today(),'')$$,'P0001','Owed amount must be 0 or more and not exceed total amount','A missing share is rejected');
select throws_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','No total',0,0,hulog_today(),'')$$,'P0001','Total amount must be greater than 0','A zero total is still rejected');
select throws_ok($$select record_abono_entry('settlement','75000000-0000-0000-0000-000000000002','75000000-0000-0000-0000-000000000001','Settlement',0,0,hulog_today(),'')$$,'P0001','Total amount must be greater than 0','A zero settlement is rejected');
select throws_ok($$select record_abono_entry('settlement','75000000-0000-0000-0000-000000000002','75000000-0000-0000-0000-000000000001','Settlement',5000,0,hulog_today(),'')$$,'P0001','Settlement amount must be greater than 0','A settlement with a zero amount is rejected');
select lives_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Wrapper',5000,0,hulog_today(),'')$$,'The 8-argument form accepts a zero share too');
select lives_ok($$select record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Keyed',5000,0,hulog_today(),'','b4000000-0000-0000-0000-000000000001')$$,'The 9-argument keyed form accepts a zero share too');
select is(record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Keyed',5000,0,hulog_today(),'','b4000000-0000-0000-0000-000000000001'),(select id from abono_entries where description='Keyed'),'A replayed key still returns the same entry');

-- The partner reads and confirms the zero-share entry; balances are unaffected.
select pg_temp.actor(2);
select is((select owed_amount_centavos from abono_entries where id=pg_temp.id('zero')),0::bigint,'The partner sees the zero share');
select lives_ok($$select confirm_abono_entry((select val::uuid from fixture where key='zero'))$$,'The partner confirms the zero-share entry');
select is((select coalesce(sum(owed_centavos),0)::bigint from abono_summary where debtor_id='75000000-0000-0000-0000-000000000002'),0::bigint,'A confirmed zero share adds nothing to what the partner owes');
select lives_ok($$select confirm_abono_entry((select val::uuid from fixture where key='split'))$$,'The partner confirms the uneven split');
select is((select owed_centavos from abono_summary where debtor_id='75000000-0000-0000-0000-000000000002' and creditor_id='75000000-0000-0000-0000-000000000001'),3300::bigint,'The balance uses the exact owed centavos');
select pg_temp.actor(3);
select is((select count(*) from abono_entries),0::bigint,'An outsider sees no entries');

-- Editing a share to 0 and back; settlements stay positive.
select pg_temp.actor(1);
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='whole'),null,null,null,null,0)$$,'The creator edits a pending share down to 0');
select is((select owed_amount_centavos from abono_entries where id=pg_temp.id('whole')),0::bigint,'The share is now 0');
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='whole'),null,null,null,6000,4000)$$,'Total and share change together');
select is((select (total_amount_centavos,owed_amount_centavos)::text from abono_entries where id=pg_temp.id('whole')),'(6000,4000)','Both changed');
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='whole'),null,null,null,null,6001)$$,'P0001','Owed amount must be 0 or more and not exceed total amount','An edit above the total is rejected');
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='whole'),null,null,null,null,-5)$$,'P0001','Owed amount must be 0 or more and not exceed total amount','A negative edit is rejected');
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='split'),null,null,null,null,0)$$,'A confirmed share can be edited to 0');
select is((select status from abono_entries where id=pg_temp.id('split')),'pending','Changing a confirmed share asks the partner to confirm again');
-- A settlement against the remaining balance.
select pg_temp.actor(2);
select lives_ok($$select confirm_abono_entry((select val::uuid from fixture where key='split'))$$,'The partner confirms the share-0 edit');
select pg_temp.actor(1);
insert into fixture values('big',record_abono_entry('expense','75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000002','Big',10000,6000,hulog_today(),'')::text);
select pg_temp.actor(2);
select lives_ok($$select confirm_abono_entry((select val::uuid from fixture where key='big'))$$,'The partner confirms a 60 percent share');
insert into fixture values('settle',record_abono_entry('settlement','75000000-0000-0000-0000-000000000002','75000000-0000-0000-0000-000000000001','Settlement',6000,6000,hulog_today(),'')::text);
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='settle'),null,null,null,0,0)$$,'P0001','Total amount must be greater than 0','A settlement cannot be edited to 0');
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='settle'),null,null,null,6000,0)$$,'P0001','Settlement amount must be greater than 0','A settlement amount cannot be edited to 0 either');
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='settle'),null,null,null,7000,6000)$$,'P0001','Settlement total amount must equal owed amount','A settlement still needs total equal to its amount');

select * from finish();
rollback;
