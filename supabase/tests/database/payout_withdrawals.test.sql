begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select no_plan();
create or replace function public.hulog_today() returns date language sql stable set search_path = public, pg_temp
as $$ select '2026-10-23'::date $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('73000000-0000-0000-0000-000000000001','withdraw-a@hulog.test','{"full_name":"Ana"}'),
 ('73000000-0000-0000-0000-000000000002','withdraw-b@hulog.test','{"full_name":"Bea"}'),
 ('73000000-0000-0000-0000-000000000003','withdraw-c@hulog.test','{"full_name":"Cai"}'),
 ('73000000-0000-0000-0000-000000000004','withdraw-d@hulog.test','{"full_name":"Dan"}');
insert into groups(id,name,owner_id) values
 ('73000000-0000-0000-0000-000000000010','Withdrawal group','73000000-0000-0000-0000-000000000001'),
 ('73000000-0000-0000-0000-000000000011','Other group','73000000-0000-0000-0000-000000000003');
insert into memberships(group_id,user_id,status) values
 ('73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000001','active'),
 ('73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000002','active'),
 ('73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000004','removed'),
 ('73000000-0000-0000-0000-000000000011','73000000-0000-0000-0000-000000000003','active');
insert into wallets(id,group_id,holder_id,label,created_by) values
 ('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000001','Ana wallet','73000000-0000-0000-0000-000000000001'),
 ('73000000-0000-0000-0000-000000000021','73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000002','Bea wallet','73000000-0000-0000-0000-000000000002'),
 ('73000000-0000-0000-0000-000000000022','73000000-0000-0000-0000-000000000011','73000000-0000-0000-0000-000000000003','Cai wallet','73000000-0000-0000-0000-000000000003'),
 ('73000000-0000-0000-0000-000000000023','73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000001','Ack wallet','73000000-0000-0000-0000-000000000001'),
 ('73000000-0000-0000-0000-000000000024','73000000-0000-0000-0000-000000000010','73000000-0000-0000-0000-000000000001','Full ack wallet','73000000-0000-0000-0000-000000000001');
create temporary table cycles_fixture(key text primary key, id uuid);
insert into cycles_fixture values
 ('partial','73000000-0000-0000-0000-000000000030'),
 ('current','73000000-0000-0000-0000-000000000031'),
 ('auto','73000000-0000-0000-0000-000000000032'),
 ('legacy','73000000-0000-0000-0000-000000000033'),
 ('ack','73000000-0000-0000-0000-000000000034'),
 ('correction','73000000-0000-0000-0000-000000000035'),
 ('other','73000000-0000-0000-0000-000000000036'),
 ('full_ack','73000000-0000-0000-0000-000000000037'),
 ('zero','73000000-0000-0000-0000-000000000038');
create function pg_temp.id(k text) returns uuid language sql as $$ select id from cycles_fixture where key=k $$;
grant select on cycles_fixture to authenticated;
insert into cycles(id,group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status,accepted_at,received_at,wallet_id)
select id, case when key='other' then '73000000-0000-0000-0000-000000000011'::uuid else '73000000-0000-0000-0000-000000000010'::uuid end,
 5000,10,case when key='current' then '2026-12-01'::date else '2026-10-01'::date end,
 case when key='current' then '2026-12-10'::date else '2026-10-10'::date end,
 case when key='auto' then '73000000-0000-0000-0000-000000000001'::uuid else '73000000-0000-0000-0000-000000000002'::uuid end,
 '73000000-0000-0000-0000-000000000001','accepted',now(),case when key='legacy' then now() end,
 case when key='other' then '73000000-0000-0000-0000-000000000022'::uuid
      when key='ack' then '73000000-0000-0000-0000-000000000023'::uuid
      when key='full_ack' then '73000000-0000-0000-0000-000000000024'::uuid
      else '73000000-0000-0000-0000-000000000020'::uuid end
from cycles_fixture;
insert into payments(id,cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at)
select ('73000000-0000-0000-0000-'||lpad((40 + row_number() over(order by f.key))::text,12,'0'))::uuid, f.id,
 case when x.member_no=1 then '73000000-0000-0000-0000-000000000001'::uuid else '73000000-0000-0000-0000-000000000002'::uuid end,
 case when f.key='ack' then 1 else 10 end,
 case when f.key='ack' then 5000 else 50000 end,
 'confirmed',true,case when x.member_no=1 then '73000000-0000-0000-0000-000000000001'::uuid else '73000000-0000-0000-0000-000000000002'::uuid end,
 case when x.member_no=1 then '73000000-0000-0000-0000-000000000002'::uuid else '73000000-0000-0000-0000-000000000001'::uuid end,now()
from cycles_fixture f cross join (values(1),(2)) x(member_no) where f.key in ('partial','ack','current','full_ack');
insert into payments(id,cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at)
values('73000000-0000-0000-0000-000000000050',pg_temp.id('correction'),'73000000-0000-0000-0000-000000000001',1,5000,'confirmed',true,'73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002',now()),
 ('73000000-0000-0000-0000-000000000051',pg_temp.id('correction'),'73000000-0000-0000-0000-000000000002',1,5000,'confirmed',true,'73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001',now());
create function pg_temp.actor(n integer) returns void language sql as $$ select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text $$;
create function pg_temp.cid(k text) returns uuid language sql as $$ select id from cycles_fixture where key=k $$;
create function pg_temp.withdrawal_id(k text) returns uuid language sql as $$ select id from payout_withdrawals where note=k $$;
create temporary table withdrawal_auth_fixture(note text primary key, id uuid not null);
grant select, insert on withdrawal_auth_fixture to authenticated;

select ok((select relrowsecurity from pg_class where oid='public.payout_withdrawals'::regclass),'RLS enabled on withdrawal ledger');
select ok(has_table_privilege('authenticated','public.payout_withdrawals','SELECT'),'Authenticated can select withdrawal ledger');
select ok(not has_table_privilege('authenticated','public.payout_withdrawals','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated has no direct withdrawal writes');
select ok(not has_table_privilege('anon','public.payout_withdrawals','SELECT,INSERT,UPDATE,DELETE'),'Anon has no withdrawal privileges');
select ok(not has_function_privilege('public','public.record_payout_withdrawal(uuid,numeric,text,date)','execute'),'Public cannot record withdrawals');
select ok(not has_function_privilege('anon','public.record_payout_withdrawal(uuid,numeric,text,date)','execute'),'Anon cannot record withdrawals');
select ok(has_function_privilege('authenticated','public.record_payout_withdrawal(uuid,numeric,text,date)','execute'),'Authenticated can call scoped withdrawal RPC');
select ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid='public.record_payout_withdrawal(uuid,numeric,text,date)'::regprocedure),'Record RPC is a pinned security definer');
select ok(not has_function_privilege('anon','public.void_payout_withdrawal(uuid)','execute'),'Anon cannot correct withdrawals');

set local role authenticated;
select pg_temp.actor(3);
select is((select count(*) from payout_withdrawals),0::bigint,'Other group reads no withdrawals');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),100)$$,'P0001','Cycle not in your group','Other group cannot record withdrawal');
select pg_temp.actor(4);
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),100)$$,'P0001','Active membership required','Removed member cannot record withdrawal');
select pg_temp.actor(1);
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('current'),100)$$,'P0001','Only an unreceived completed cycle can record a withdrawal','Current round is rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('auto'),100)$$,'P0001','Only the active holder or receiver can record this withdrawal','Holder cannot withdraw a cycle received by the holder');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('legacy'),100)$$,'P0001','Only an unreceived completed cycle can record a withdrawal','Legacy received cycle remains closed to withdrawals');
select throws_ok($$insert into payout_withdrawals(group_id,cycle_id,amount_centavos,created_by) values('73000000-0000-0000-0000-000000000010',pg_temp.cid('partial'),1,auth.uid())$$,'42501',null,'Direct insert is denied');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),null)$$,'P0001','Withdrawal amount must be a positive integer number of centavos','Null amount is rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),0)$$,'P0001','Withdrawal amount must be a positive integer number of centavos','Zero amount is rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),-1)$$,'P0001','Withdrawal amount must be a positive integer number of centavos','Negative amount is rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),1.5)$$,'P0001','Withdrawal amount must be a positive integer number of centavos','Fractional centavos are rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),1,'',hulog_today()+1)$$,'P0001','Withdrawal date cannot be in the future','Future date is rejected');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),1,'',date '2026-09-30')$$,'P0001','Withdrawal date cannot be before the cycle start date','A withdrawal cannot predate its cycle');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),1,repeat('n',141))$$,'P0001','Note cannot exceed 140 characters','Long note is rejected');
select is((select count(*) from payout_withdrawals),0::bigint,'Rejected writes leave no ledger entries');

select lives_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),3000,'first partial')$$,'Holder records a partial cash withdrawal');
select is((select created_by from payout_withdrawals where note='first partial'),auth.uid(),'Actor is taken from auth.uid');
select is((select withdrawal_date from payout_withdrawals where note='first partial'),'2026-10-23'::date,'Withdrawal date defaults to Asia/Manila hulog_today');
insert into withdrawal_auth_fixture(note,id) select note,id from payout_withdrawals where note='first partial';
select ok((select id is not null from withdrawal_auth_fixture where note='first partial'),'Withdrawal authorization fixture captures a real row id as an authorized holder');
select pg_temp.actor(3);
select throws_ok($$select void_payout_withdrawal((select id from withdrawal_auth_fixture where note='first partial'))$$,'P0001','Withdrawal not in your group','Another group cannot void the captured withdrawal');
select pg_temp.actor(4);
select throws_ok($$select void_payout_withdrawal((select id from withdrawal_auth_fixture where note='first partial'))$$,'P0001','Active membership required','Removed member cannot void the captured withdrawal');
select pg_temp.actor(1);
select is((select voided_at from payout_withdrawals where id=(select id from withdrawal_auth_fixture where note='first partial')),null::timestamptz,'Unauthorized void attempts preserve the active withdrawal');
select is((select withdrawn_centavos from cycle_summary where id=pg_temp.cid('partial')),3000::bigint,'Cycle summary derives active withdrawals');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('partial')),97000::bigint,'Cycle summary retains the remaining held balance');
select is((select pot_centavos from cycle_summary where id=pg_temp.cid('partial')),100000::bigint,'Original pot remains based on confirmed payments');
select is((select payout_state from cycle_summary where id=pg_temp.cid('partial')),'Waiting for Got it','Partial withdrawal does not mark full payout received');
select is((select paluwagan_centavos from custody_summary where wallet_id='73000000-0000-0000-0000-000000000020'),207000::bigint,'Custody total includes held balances from all unreceived cycles');
select throws_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),97001)$$,'P0001','Withdrawal exceeds the remaining held amount','Cannot withdraw above current remaining balance');
select pg_temp.actor(2);
select lives_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),2000,'partner partial')$$,'Receiver can record a past cash withdrawal');
select is((select count(*) from payout_withdrawals),2::bigint,'Both authorized users see ledger history');
select throws_ok($$delete from payout_withdrawals where note='first partial'$$,'42501',null,'Direct delete is denied');
select throws_ok($$update payout_withdrawals set amount_centavos=1 where note='first partial'$$,'42501',null,'Direct update is denied');
select pg_temp.actor(1);
select lives_ok($$select void_payout_withdrawal(pg_temp.withdrawal_id('first partial'))$$,'Holder soft-voids a mistaken withdrawal');
select ok((select voided_at is not null and voided_by=auth.uid() from payout_withdrawals where note='first partial'),'Void preserves row and correction actor');
select is((select withdrawn_centavos from cycle_summary where id=pg_temp.cid('partial')),2000::bigint,'Voided withdrawal is excluded from active total');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('partial')),98000::bigint,'Voiding restores the held balance');
select throws_ok($$select void_payout_withdrawal(pg_temp.withdrawal_id('first partial'))$$,'P0001','Withdrawal is already voided','Already voided row cannot be voided twice');
select lives_ok($$select record_payout_withdrawal(pg_temp.cid('partial'),98000,'final withdrawal')$$,'Full remaining amount can be recorded');
select is((select payout_state from cycle_summary where id=pg_temp.cid('partial')),'Received','Full ledger withdrawal satisfies payout state');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('partial')),0::bigint,'Full withdrawal leaves no held balance');
select lives_ok($$select void_payout_withdrawal(pg_temp.withdrawal_id('final withdrawal'))$$,'Full withdrawal remains correctable');
select is((select payout_state from cycle_summary where id=pg_temp.cid('partial')),'Waiting for Got it','Voiding a full withdrawal reopens the balance');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('partial')),98000::bigint,'Correcting a full withdrawal restores its remaining amount');
select pg_temp.actor(2);
select lives_ok($$select record_payout_withdrawal(pg_temp.cid('ack'),4000,'before got it')$$,'Partial withdrawal can precede full receipt acknowledgment');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('ack')),6000::bigint,'Partial withdrawal leaves only the remaining amount held');
select lives_ok($$select receive_payout(pg_temp.cid('ack'))$$,'Existing receive_payout acknowledges the remaining amount');
select is((select payout_state from cycle_summary where id=pg_temp.cid('ack')),'Received','Existing receive_payout remains compatible');
select is((select withdrawn_centavos from cycle_summary where id=pg_temp.cid('ack')),4000::bigint,'Existing receive does not double-count the ledger');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('ack')),0::bigint,'Acknowledged remaining amount leaves custody');
select throws_ok($$select void_payout_withdrawal(pg_temp.withdrawal_id('before got it'))$$,'P0001','Withdrawal cannot be corrected after the remaining payout is acknowledged','Acknowledged remaining payout cannot be undone');
select pg_temp.actor(1);
select lives_ok($$select record_payout_withdrawal(pg_temp.cid('full_ack'),100000,'full before got it')$$,'A full ledger withdrawal can be acknowledged separately');
select is((select payout_state from cycle_summary where id=pg_temp.cid('full_ack')),'Received','Full ledger withdrawal derives received state');
select is((select received_at from cycles where id=pg_temp.cid('full_ack')),null::timestamptz,'Full ledger withdrawal alone leaves receipt acknowledgment open');
select pg_temp.actor(2);
select lives_ok($$select receive_payout(pg_temp.cid('full_ack'))$$,'Receiver can acknowledge a fully withdrawn ledger payout');
select ok((select received_at is not null from cycles where id=pg_temp.cid('full_ack')),'Full withdrawal acknowledgment closes correction window');
select throws_ok($$select void_payout_withdrawal(pg_temp.withdrawal_id('full before got it'))$$,'P0001','Withdrawal cannot be corrected after the remaining payout is acknowledged','Acknowledged full withdrawal can no longer be undone');
select pg_temp.actor(1);
select lives_ok($$select update_wallet('73000000-0000-0000-0000-000000000024','Full ack wallet',true)$$,'Holder can archive the wallet after full payout acknowledgment');
select ok((select archived_at is not null from wallets where id='73000000-0000-0000-0000-000000000024'),'Acknowledged full payout wallet is archived');
select pg_temp.actor(2);
select is((select payout_state from cycle_summary where id=pg_temp.cid('zero')),'Waiting for Got it','Zero-pot closed cycle still awaits receiver acknowledgment');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('zero')),0::bigint,'Zero-pot cycle has no held amount');
select lives_ok($$select receive_payout(pg_temp.cid('zero'))$$,'Receiver can acknowledge a zero-pot closed cycle');
select is((select received_at is not null from cycles where id=pg_temp.cid('legacy')),true,'Legacy received timestamp stays intact');
select is((select payout_state from cycle_summary where id=pg_temp.cid('legacy')),'Received','Legacy received cycle remains received');
select is((select amount_centavos from payments where cycle_id=pg_temp.cid('partial') order by id limit 1),50000::bigint,'Withdrawals never edit contributions');
select is((select debt_centavos from member_progress where cycle_id=pg_temp.cid('partial') and member_id='73000000-0000-0000-0000-000000000001'),0::bigint,'Withdrawals never edit cycle debt');
select ok(exists(select 1 from history where entity='payout_withdrawals' and entity_id=pg_temp.withdrawal_id('partner partial') and actor_id='73000000-0000-0000-0000-000000000002'),'History trigger records withdrawal actor');
select ok(exists(select 1 from history where entity='payout_withdrawals' and entity_id=pg_temp.withdrawal_id('first partial') and action='update' and actor_id='73000000-0000-0000-0000-000000000001'),'History records soft void without deleting evidence');
select lives_ok($$select record_payout_withdrawal(pg_temp.cid('correction'),10000,'correction test')$$,'Full payout can precede a later payment correction');
select edit_payment('73000000-0000-0000-0000-000000000050',1,true);
select is((select pot_centavos from cycle_summary where id=pg_temp.cid('correction')),5000::bigint,'Payment correction updates the source pot');
select is((select withdrawn_centavos from cycle_summary where id=pg_temp.cid('correction')),10000::bigint,'Payment correction retains withdrawal history');
select is((select held_centavos from cycle_summary where id=pg_temp.cid('correction')),0::bigint,'Payment correction never produces negative held custody');
select ok((select withdrawn_centavos > pot_centavos from cycle_summary where id=pg_temp.cid('correction')),'Over-withdrawal after correction is visible as a discrepancy');
select pg_temp.actor(3);
select is((select count(*) from payout_withdrawals),0::bigint,'Other group cannot read this group ledger');
select pg_temp.actor(1);
select is((select pot_centavos from cycle_summary where id=pg_temp.cid('current')),100000::bigint,'Current round confirmed pot remains unchanged');
select is((select count(*) from payout_withdrawals where cycle_id=pg_temp.cid('current')),0::bigint,'Current round has no withdrawal rows');
select is((select payout_state from cycle_summary where id=pg_temp.cid('current')),null::text,'Current round remains open without payout state');
select is((select count(*) from history where entity='payout_withdrawals' and entity_id=pg_temp.withdrawal_id('first partial')),2::bigint,'Both ledger mutations remain in history');
select * from finish();
rollback;
