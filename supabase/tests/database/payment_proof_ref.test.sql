-- Optional payment proof reference (SPEC 10.14).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select plan(68);
insert into auth.users(id,email,raw_user_meta_data) values
 ('74000000-0000-0000-0000-000000000001','ref-a@hulog.test','{"full_name":"Ana"}'),
 ('74000000-0000-0000-0000-000000000002','ref-b@hulog.test','{"full_name":"Bea"}'),
 ('74000000-0000-0000-0000-000000000003','ref-c@hulog.test','{"full_name":"Cai"}');
insert into groups(id,name,owner_id) values ('74000000-0000-0000-0000-0000000000a0','Ref','74000000-0000-0000-0000-000000000001');
insert into memberships(group_id,user_id,status) values
 ('74000000-0000-0000-0000-0000000000a0','74000000-0000-0000-0000-000000000001','active'),
 ('74000000-0000-0000-0000-0000000000a0','74000000-0000-0000-0000-000000000002','active');
insert into wallets(id,group_id,holder_id,label,created_by) values
 ('74000000-0000-0000-0000-0000000000b0','74000000-0000-0000-0000-0000000000a0','74000000-0000-0000-0000-000000000001','Maya','74000000-0000-0000-0000-000000000001');
insert into cycles(id,group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status,accepted_at,wallet_id) values
 ('74000000-0000-0000-0000-0000000000c1','74000000-0000-0000-0000-0000000000a0',5000,30,hulog_today()-3,hulog_today()+26,
  '74000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000001','accepted',now(),'74000000-0000-0000-0000-0000000000b0');
create temporary table fixture(key text primary key,val text);
grant all on fixture to authenticated,anon;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$select val::uuid from fixture where key=k$$;
grant select on cycles to authenticated;

-- Structure and grants (as the table owner).
select has_column('public','payments','proof_ref','payments has proof_ref');
select has_column('public','abono_entries','proof_ref','abono_entries has proof_ref');
select ok(not has_function_privilege('anon','public.record_payment(uuid,integer,text,uuid,text)','execute'),'Anon cannot execute the 5-argument record_payment');
select ok(not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)','execute'),'Anon cannot execute the 10-argument record_abono_entry');
select ok(not has_function_privilege('anon','public.edit_payment(uuid,integer,boolean,text,text)','execute'),'Anon cannot execute the 5-argument edit_payment');
select ok(not has_function_privilege('anon','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)','execute'),'Anon cannot execute the 10-argument edit_abono_entry');
select ok(not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute')
 and not has_function_privilege('anon','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute'),'Anon cannot execute the rewritten 9- and 8-argument record_abono_entry');
select ok(has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)','execute'),'Authenticated can execute the rewritten 9- and 8-argument record_abono_entry');
select ok(not has_function_privilege('anon','public.record_payment(uuid,integer,text,uuid)','execute')
 and not has_function_privilege('anon','public.edit_payment(uuid,integer,boolean,text)','execute')
 and not has_function_privilege('anon','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean)','execute'),'Anon cannot execute the wrapper signatures either');
select ok(has_function_privilege('authenticated','public.record_payment(uuid,integer,text,uuid,text)','execute')
 and has_function_privilege('authenticated','public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)','execute')
 and has_function_privilege('authenticated','public.edit_payment(uuid,integer,boolean,text,text)','execute')
 and has_function_privilege('authenticated','public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)','execute')
 and has_function_privilege('authenticated','public.record_payment(uuid,integer,text,uuid)','execute')
 and has_function_privilege('authenticated','public.edit_payment(uuid,integer,boolean,text)','execute'),'Authenticated can execute the new and wrapper signatures');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid in ('public.record_payment(uuid,integer,text,uuid,text)'::regprocedure,
  'public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text,uuid,text)'::regprocedure,
  'public.edit_payment(uuid,integer,boolean,text,text)'::regprocedure,
  'public.edit_abono_entry(uuid,uuid,uuid,text,bigint,bigint,date,text,boolean,text)'::regprocedure,
  'private.clean_proof_ref(text)'::regprocedure) and a.grantee=0),'PUBLIC has no execute on the new functions');
select ok(not has_function_privilege('authenticated','private.clean_proof_ref(text)','execute'),'The validation helper is private');
select ok(not has_table_privilege('anon','public.payments','SELECT') and not has_table_privilege('anon','public.abono_entries','SELECT'),'Anon cannot read either table');

set local role authenticated;
-- Payments: Ana pays, Bea receives.
select pg_temp.actor(1);
insert into fixture values('p1',record_payment('74000000-0000-0000-0000-0000000000c1',2,'gcash','b2000000-0000-0000-0000-000000000001','  GC 1234-ABCD  ')::text);
select is((select proof_ref from payments where id=pg_temp.id('p1')),'GC 1234-ABCD','A reference is trimmed and stored');
insert into fixture values('p2',record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'   ')::text);
select ok((select proof_ref is null from payments where id=pg_temp.id('p2')),'A blank reference is stored as null');
insert into fixture values('p3',record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null)::text);
select ok((select proof_ref is null from payments where id=pg_temp.id('p3')),'The 4-argument form stores no reference');
insert into fixture values('p4',record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'1234')::text);
select is((select proof_ref from payments where id=pg_temp.id('p4')),'1234','A 4-character reference is accepted');
insert into fixture values('p5',record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,repeat('A',40))::text);
select is((select char_length(proof_ref) from payments where id=pg_temp.id('p5')),40,'A 40-character reference is accepted');
select throws_ok($$select record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'abc')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','3 characters rejected');
select throws_ok($$select record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,repeat('A',41))$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','41 characters rejected');
select throws_ok($$select record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'ref#1234')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','Punctuation rejected');
select throws_ok($$select record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'1234;drop')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','A semicolon is rejected');
select throws_ok($$select record_payment('74000000-0000-0000-0000-0000000000c1',1,'',null,'ñandú1234')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','Non-ASCII letters rejected');
select is((select count(*) from payments),5::bigint,'Rejected references wrote nothing');

-- A replay returns the original payment and keeps its reference.
insert into fixture values('p6',record_payment('74000000-0000-0000-0000-0000000000c1',1,'','b2000000-0000-0000-0000-000000000006','REPLAY 0001')::text);
select is(record_payment('74000000-0000-0000-0000-0000000000c1',1,'','b2000000-0000-0000-0000-000000000006','OTHER 9999'),pg_temp.id('p6'),'A replay returns the original payment');
select is((select proof_ref from payments where id=pg_temp.id('p6')),'REPLAY 0001','A replay never overwrites the reference');

-- Visibility follows the existing RLS.
select pg_temp.actor(2);
select is((select proof_ref from payments where id=pg_temp.id('p1')),'GC 1234-ABCD','The partner sees the reference');
select pg_temp.actor(3);
select is((select count(*) from payments),0::bigint,'An outsider sees no payments, so no references');

-- Editing a payment reference: creator only, pending only.
select pg_temp.actor(1);
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,'MAYA 5555')$$,'The creator changes the reference while pending');
select is((select proof_ref from payments where id=pg_temp.id('p1')),'MAYA 5555','The reference changed');
select is((select status from payments where id=pg_temp.id('p1')),'pending','Changing the reference alone keeps the payment pending');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,'new note')$$,'The 4-argument edit still works');
select is((select proof_ref from payments where id=pg_temp.id('p1')),'MAYA 5555','The 4-argument edit leaves the reference alone');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,null)$$,'A null reference in the edit means leave it alone');
select is((select proof_ref from payments where id=pg_temp.id('p1')),'MAYA 5555','Null left the reference unchanged');
select throws_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,'x')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','An invalid reference is rejected on edit');
select pg_temp.actor(2);
select throws_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,'STOLEN 0001')$$,'P0001','Reference can only be changed by its creator while pending','The partner cannot change the reference');
select throws_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,'')$$,'P0001','Reference can only be changed by its creator while pending','The partner cannot clear the reference');
select lives_ok($$select confirm_payment((select val::uuid from fixture where key='p1'))$$,'The partner confirms the payment');
select pg_temp.actor(1);
select throws_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,null,'LATE 12345')$$,'P0001','Reference can only be changed by its creator while pending','The creator cannot change the reference once confirmed');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p1'),null,false,'still ok','MAYA 5555')$$,'Sending the unchanged reference with a note edit is fine');
select is((select proof_ref from payments where id=pg_temp.id('p1')),'MAYA 5555','The confirmed reference is untouched');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p2'),null,false,null,'')$$,'An empty reference on a payment with none is a no-op');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p4'),null,false,null,'')$$,'The creator clears a reference while pending');
select ok((select proof_ref is null from payments where id=pg_temp.id('p4')),'An empty string clears the reference');
select lives_ok($$select edit_payment((select val::uuid from fixture where key='p5'),2,false,null,'NEW 0005')$$,'Days and reference can change together while pending');
select is((select (days,proof_ref)::text from payments where id=pg_temp.id('p5')),'(2,"NEW 0005")','Both changed');

-- The database check also guards direct writes.
reset role;
select throws_ok($$update payments set proof_ref='ab' where id=(select val::uuid from fixture where key='p3')$$,'23514',null,'The table check rejects a short reference');
select throws_ok($$update payments set proof_ref=' padded 123 ' where id=(select val::uuid from fixture where key='p3')$$,'23514',null,'The table check rejects an untrimmed reference');
set local role authenticated;

-- Abono entries between Ana and Bea.
select pg_temp.actor(1);
insert into fixture values('a1',record_abono_entry('expense','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','Kuryente',245000,122500,hulog_today(),'','b3000000-0000-0000-0000-000000000001','  GC 7777 8888 ')::text);
select is((select proof_ref from abono_entries where id=pg_temp.id('a1')),'GC 7777 8888','An abono reference is trimmed and stored');
insert into fixture values('a2',record_abono_entry('expense','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','Tubig',10000,5000,hulog_today(),'','b3000000-0000-0000-0000-000000000002')::text);
select ok((select proof_ref is null from abono_entries where id=pg_temp.id('a2')),'The 9-argument form stores no reference');
insert into fixture values('a3',record_abono_entry('expense','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','Internet',10000,5000,hulog_today(),'')::text);
select ok((select proof_ref is null from abono_entries where id=pg_temp.id('a3')),'The 8-argument form stores no reference');
select throws_ok($$select record_abono_entry('expense','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','Bad',10000,5000,hulog_today(),'',null,'no')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','An invalid abono reference is rejected');
select throws_ok($$select record_abono_entry('expense','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','Bad',10000,5000,hulog_today(),'',null,'12345;--')$$,'P0001','Reference must be 4 to 40 letters, numbers, spaces or dashes','Punctuation is rejected on abono');
select is((select count(*) from abono_entries),3::bigint,'Rejected abono references wrote nothing');
select pg_temp.actor(2);
select is((select proof_ref from abono_entries where id=pg_temp.id('a1')),'GC 7777 8888','The partner sees the abono reference');
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='a1'),null,null,null,null,null,null,null,false,'STOLEN 0001')$$,'P0001','Reference can only be changed by its creator while pending','The partner cannot change an abono reference');
select pg_temp.actor(3);
select is((select count(*) from abono_entries),0::bigint,'An outsider sees no abono entries');
select pg_temp.actor(1);
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='a1'),null,null,null,null,null,null,null,false,'MAYA 9999')$$,'The creator changes an abono reference while pending');
select is((select proof_ref from abono_entries where id=pg_temp.id('a1')),'MAYA 9999','The abono reference changed');
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='a1'),null,null,null,null,null,null,'a note',false)$$,'The 9-argument edit still works');
select is((select proof_ref from abono_entries where id=pg_temp.id('a1')),'MAYA 9999','The 9-argument edit leaves the reference alone');
select pg_temp.actor(2);
select lives_ok($$select confirm_abono_entry((select val::uuid from fixture where key='a1'))$$,'The partner confirms the entry');
select pg_temp.actor(1);
select throws_ok($$select edit_abono_entry((select val::uuid from fixture where key='a1'),null,null,null,null,null,null,null,false,'LATE 12345')$$,'P0001','Reference can only be changed by its creator while pending','The creator cannot change the abono reference once confirmed');
select is((select status from abono_entries where id=pg_temp.id('a1')),'confirmed','The failed edit left the entry confirmed');
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='a2'),null,null,null,null,null,null,null,false,'')$$,'An empty reference on an entry with none is a no-op');
select lives_ok($$select edit_abono_entry((select val::uuid from fixture where key='a3'),null,null,null,20000,10000,null,null,false,'NEW 0003')$$,'A money edit and a reference can change together while pending');
select is((select (total_amount_centavos,proof_ref)::text from abono_entries where id=pg_temp.id('a3')),'(20000,"NEW 0003")','Both changed');

select * from finish();
rollback;
