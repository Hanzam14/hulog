begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select no_plan();
create or replace function public.hulog_today() returns date language sql stable set search_path = public, pg_temp
as $$ select '2026-10-07'::date $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-0000-0000-000000000001','round2-a@hulog.test','{"full_name":"A"}'),
 ('20000000-0000-0000-0000-000000000002','round2-b@hulog.test','{"full_name":"B"}'),
 ('20000000-0000-0000-0000-000000000003','round2-outsider@hulog.test','{"full_name":"C"}');
insert into groups(id,name,owner_id) values ('20000000-0000-0000-0000-000000000010','Round2','20000000-0000-0000-0000-000000000001');
insert into memberships(group_id,user_id,status)
select '20000000-0000-0000-0000-000000000010',id,'active' from profiles where id in
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
create temporary table cases(key text primary key, cid uuid default gen_random_uuid(), pid uuid default gen_random_uuid(), end_date date, cycle_status text, payer uuid, payment_status text, deleted_at timestamptz);
insert into cases(key,end_date,cycle_status,payer,payment_status,deleted_at) values
 ('open','2026-10-21','accepted','20000000-0000-0000-0000-000000000001','confirmed',null),
 ('settling','2026-10-06','accepted','20000000-0000-0000-0000-000000000001','confirmed',null),
 ('old','2026-10-05','accepted','20000000-0000-0000-0000-000000000001','confirmed',null),
 ('deleted','2026-10-21','accepted','20000000-0000-0000-0000-000000000001','confirmed',now()),
 ('partner','2026-10-21','accepted','20000000-0000-0000-0000-000000000002','confirmed',null),
 ('pending','2026-10-21','accepted','20000000-0000-0000-0000-000000000001','pending',null),
 ('proposal','2026-10-21','proposed','20000000-0000-0000-0000-000000000001','confirmed',null);
insert into cycles(id,group_id,daily_amount_centavos,num_days,start_date,end_date,receiver_id,proposed_by,status,accepted_at)
select cid,'20000000-0000-0000-0000-000000000010',7500,15,end_date-14,end_date,'20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',cycle_status,now() from cases;
insert into payments(id,cycle_id,member_id,days,amount_centavos,status,was_confirmed,created_by,confirmed_by,confirmed_at,deleted_at)
select pid,cid,payer,1,7500,payment_status,payment_status='confirmed',payer,
 case when payment_status='confirmed' then payer end,case when payment_status='confirmed' then now() end,deleted_at from cases;
create temporary table history_before as select max(id) as id from history;
-- Replay the actual migration over old-rule fixtures; all changes roll back.
-- Supabase mounts only tests into the runner. Replay the CLI's stored SQL,
-- not a copied implementation; migration up --local must precede this suite.
do $$ declare statement text; begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261007000200' and statements is not null) then
  raise exception 'Apply mutual_confirm with supabase migration up --local before testing';
 end if;
 for statement in select unnest(statements) from supabase_migrations.schema_migrations where version='20261007000200' loop
  execute statement;
 end loop;
end $$;
select is((select status from payments where id=(select pid from cases where key='open')),'pending','Migration resets open-cycle owner payment');
select is((select status from payments where id=(select pid from cases where key='settling')),'pending','Migration includes settling-day owner payment');
select is((select count(*) from payments p join cases f on p.id=f.pid where f.key in ('open','settling') and p.was_confirmed and p.confirmed_by is null and p.confirmed_at is null),2::bigint,'Migration preserves reconfirmation eligibility and clears metadata');
select is((select count(*) from payments p join cases f on p.id=f.pid where f.key in ('old','deleted','partner','proposal') and p.status='confirmed' and p.confirmed_by=f.payer and p.confirmed_at is not null),4::bigint,'Migration leaves older/deleted/partner/unaccepted rows untouched');
select ok(not (select was_confirmed from payments where id=(select pid from cases where key='pending')),'Migration leaves never-confirmed pending row unchanged');
select is((select count(*) from history h join cases f on h.entity_id=f.pid where h.id>(select id from history_before) and h.actor_id is null and h.entity='payments' and h.action='update' and h."before"->>'status'='confirmed' and h."after"->>'status'='pending'),2::bigint,'Migration writes exactly two system before/after audit entries');
grant select on cases to authenticated;
create function pg_temp.actor(n integer) returns void language sql as $$ select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text $$;
create function pg_temp.cid(k text) returns uuid language sql as $$ select cid from cases where key=k $$;
set local role authenticated;
select pg_temp.actor(2);
select throws_ok($$select give_payout(pg_temp.cid('open'))$$,'P0001','Current receiver only','Other member cannot take payout');
select pg_temp.actor(1);
select lives_ok($$select give_payout(pg_temp.cid('open'))$$,'Current receiver can give live payout');
select is((select receiver_id from cycles where id=pg_temp.cid('open')),'20000000-0000-0000-0000-000000000002'::uuid,'Hand-off chooses other active member');
select ok(exists(select 1 from history where entity_id=pg_temp.cid('open') and actor_id=auth.uid() and "before"->>'receiver_id'='20000000-0000-0000-0000-000000000001' and "after"->>'receiver_id'='20000000-0000-0000-0000-000000000002'),'Hand-off records actor and receiver history');
select throws_ok($$select give_payout(pg_temp.cid('open'))$$,'P0001','Current receiver only','Former receiver cannot give again');
select throws_ok($$select give_payout(pg_temp.cid('settling'))$$,'P0001','Payout hand-off window closed','Settling cycle cannot be handed off');
select throws_ok($$select give_payout(pg_temp.cid('old'))$$,'P0001','Payout hand-off window closed','Ended cycle cannot be handed off');
select throws_ok($$select give_payout(pg_temp.cid('proposal'))$$,'P0001','Payout hand-off window closed','Proposal cannot be handed off');
select pg_temp.actor(3);
select throws_ok($$select give_payout(pg_temp.cid('open'))$$,'P0001','Active membership required','Nonmember cannot hand off foreign cycle');
reset role;
update cycles set received_at=now() where id=pg_temp.cid('open');
set local role authenticated;
select pg_temp.actor(2);
select throws_ok($$select give_payout(pg_temp.cid('open'))$$,'P0001','Payout hand-off window closed','Received cycle cannot be handed off even before end date');
reset role;
update cycles set received_at=null,start_date='2026-10-08',end_date='2026-10-22' where id=pg_temp.cid('open');
set local role authenticated;
select lives_ok($$select give_payout(pg_temp.cid('open'))$$,'Upcoming accepted cycle can be handed off');
reset role;
update cycles set start_date='2026-09-23',end_date='2026-10-07' where id=pg_temp.cid('open');
set local role authenticated;
select pg_temp.actor(1);
select lives_ok($$select give_payout(pg_temp.cid('open'))$$,'Receiver can give on the end date');
reset role;
update memberships set status='removed' where user_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.actor(2);
select throws_ok($$select give_payout(pg_temp.cid('open'))$$,'P0001','Other active member required','Cannot give to an inactive partner');
reset role;
update memberships set status='active' where user_id='20000000-0000-0000-0000-000000000001';
-- Make the handed-off cycle most recently accepted and close all live fixtures.
update cycles set accepted_at=now()+interval '1 second' where id=pg_temp.cid('open');
create or replace function public.hulog_today() returns date language sql stable set search_path = public, pg_temp as $$ select '2026-11-01'::date $$;
update cycles set status='cancelled' where id=pg_temp.cid('proposal');
set local role authenticated;
select set_config('hulog.next_cycle',propose_cycle(7500,15,'2026-11-01')::text,true);
select is((select receiver_id from cycles where id=current_setting('hulog.next_cycle')::uuid),'20000000-0000-0000-0000-000000000001'::uuid,'Next proposal defaults to member other than handed-off receiver');
reset role;
select ok(has_function_privilege('authenticated','public.give_payout(uuid)','execute'),'Authenticated hand-off grant');
select ok(not has_function_privilege('anon','public.give_payout(uuid)','execute'),'Anon cannot hand off');
select ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid='public.give_payout(uuid)'::regprocedure),'Hand-off is a pinned security definer');
select * from finish();
rollback;
