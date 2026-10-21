begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select no_plan();
create or replace function public.hulog_today() returns date language sql stable set search_path = public, pg_temp
as $$ select '2026-10-20'::date $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-0000-0000-000000000001','early-a@hulog.test','{"full_name":"A"}'),
 ('30000000-0000-0000-0000-000000000002','early-b@hulog.test','{"full_name":"B"}'),
 ('30000000-0000-0000-0000-000000000003','early-outsider@hulog.test','{"full_name":"C"}'),
 ('30000000-0000-0000-0000-000000000004','early-removed@hulog.test','{"full_name":"D"}');
insert into groups(id,name,owner_id) values ('30000000-0000-0000-0000-000000000010','Early','30000000-0000-0000-0000-000000000001');
insert into memberships(group_id,user_id,status) values
 ('30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000001','active'),
 ('30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000002','active'),
 ('30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000004','removed');
insert into wallets(id,group_id,holder_id,label,created_by) values
 ('30000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000001','Maya','30000000-0000-0000-0000-000000000001');
-- a_days/b_days are confirmed days; b_pending adds one pending day for B.
create temporary table cases(key text primary key, cid uuid default gen_random_uuid(), start_date date, b_days integer, b_pending boolean, received boolean);
insert into cases(key,start_date,b_days,b_pending,received) values
 ('full','2026-10-07',15,false,false),
 ('short','2026-10-07',14,false,false),
 ('pending','2026-10-07',14,true,false),
 ('upcoming','2026-10-25',15,false,false),
 ('received','2026-10-07',15,false,true),
 ('settling','2026-10-05',15,false,false),
 ('firstday','2026-10-20',15,false,false);
insert into cycles(id,group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status,accepted_at,received_at,wallet_id)
select cid,'30000000-0000-0000-0000-000000000010',7500,15,start_date,start_date+14,'30000000-0000-0000-0000-000000000002',
 '30000000-0000-0000-0000-000000000001','accepted',now(),case when received then now() end,'30000000-0000-0000-0000-000000000020' from cases;
insert into payments(cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at)
select cid,'30000000-0000-0000-0000-000000000001'::uuid,15,112500,'confirmed',true,'30000000-0000-0000-0000-000000000001'::uuid,'30000000-0000-0000-0000-000000000002'::uuid,now() from cases
union all
select cid,'30000000-0000-0000-0000-000000000002'::uuid,b_days,b_days*7500,'confirmed',true,'30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',now() from cases
union all
select cid,'30000000-0000-0000-0000-000000000002'::uuid,1,7500,'pending',false,'30000000-0000-0000-0000-000000000002',null,null from cases where b_pending;
-- A deleted payment never counts toward a full pot.
insert into payments(cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at,deleted_at)
select cid,'30000000-0000-0000-0000-000000000002'::uuid,1,7500,'confirmed',true,'30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',now(),now() from cases where key='short';
grant select on cases to authenticated;
create function pg_temp.actor(n integer) returns void language sql as $$ select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text $$;
create function pg_temp.cid(k text) returns uuid language sql as $$ select cid from cases where key=k $$;
set local role authenticated;

select pg_temp.actor(3);
select throws_ok($$select close_cycle_early(pg_temp.cid('full'))$$,'P0001','Active membership required','Outsider cannot close a round');
select pg_temp.actor(4);
select throws_ok($$select close_cycle_early(pg_temp.cid('full'))$$,'P0001','Active membership required','Removed member cannot close a round');
select pg_temp.actor(1);
select throws_ok($$select close_cycle_early(pg_temp.cid('short'))$$,'P0001','Pot is not full yet','Pot one day short (deleted day ignored) cannot close');
select throws_ok($$select close_cycle_early(pg_temp.cid('pending'))$$,'P0001','Pot is not full yet','Pending day does not count toward a full pot');
select throws_ok($$select close_cycle_early(pg_temp.cid('upcoming'))$$,'P0001','Only an open round can close early','Upcoming round cannot close early');
select throws_ok($$select close_cycle_early(pg_temp.cid('received'))$$,'P0001','Only an open round can close early','Received round cannot close early');
select throws_ok($$select close_cycle_early(pg_temp.cid('settling'))$$,'P0001','Only an open round can close early','Settling round cannot close early');
select is((select end_date from cycles where id=pg_temp.cid('short')),'2026-10-21'::date,'Rejected close leaves end_date alone');

-- The non-receiver closes; the receiver then takes the payout today.
select lives_ok($$select close_cycle_early(pg_temp.cid('full'))$$,'Member closes a full open round');
select is((select end_date from cycles where id=pg_temp.cid('full')),'2026-10-19'::date,'end_date moves to yesterday');
select is((select planned_end_date from cycles where id=pg_temp.cid('full')),'2026-10-21'::date,'Planned end date kept');
select is((select closed_early_by from cycles where id=pg_temp.cid('full')),'30000000-0000-0000-0000-000000000001'::uuid,'Actor comes from auth.uid()');
select is((select phase from cycle_summary where id=pg_temp.cid('full')),'settling','Closed round is settling today');
select is((select payout_state from cycle_summary where id=pg_temp.cid('full')),'Waiting for Got it','Payout is available now');
select is((select debt_centavos from member_progress where cycle_id=pg_temp.cid('full') and member_id='30000000-0000-0000-0000-000000000001'),0::bigint,'Full pot leaves no debt');
select ok(exists(select 1 from history where entity='cycles' and entity_id=pg_temp.cid('full') and actor_id='30000000-0000-0000-0000-000000000001'
 and "before"->>'end_date'='2026-10-21' and "after"->>'end_date'='2026-10-19' and "after"->>'planned_end_date'='2026-10-21'),'History records actor and before/after dates');
select throws_ok($$select close_cycle_early(pg_temp.cid('full'))$$,'P0001','Only an open round can close early','Cannot close twice');
select throws_ok($$select record_payment(pg_temp.cid('full'),1)$$,'P0001','Payment window closed','No payments after early close');
select pg_temp.actor(2);
select throws_ok($$select give_payout(pg_temp.cid('full'))$$,'P0001','Payout hand-off window closed','No hand-off after early close');
select lives_ok($$select receive_payout(pg_temp.cid('full'))$$,'Receiver takes payout right after early close');
select is((select payout_state from cycle_summary where id=pg_temp.cid('full')),'Received','Payout recorded as received');

-- Closing on the first day still reads as settling, not upcoming.
select lives_ok($$select close_cycle_early(pg_temp.cid('firstday'))$$,'Receiver can also close a full round');
select is((select phase from cycle_summary where id=pg_temp.cid('firstday')),'settling','First-day close is settling');

reset role;
select ok(has_function_privilege('authenticated','public.close_cycle_early(uuid)','execute'),'Authenticated close grant');
select ok(not has_function_privilege('anon','public.close_cycle_early(uuid)','execute'),'Anon cannot close');
select ok(not has_function_privilege('public','public.close_cycle_early(uuid)','execute'),'Public cannot close');
select ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid='public.close_cycle_early(uuid)'::regprocedure),'Close is a pinned security definer');
select * from finish();
rollback;
