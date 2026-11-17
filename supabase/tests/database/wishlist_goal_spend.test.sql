begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('73000000-0000-0000-0000-000000000001','spend-a@hulog.test','{"full_name":"Ana"}'),
 ('73000000-0000-0000-0000-000000000002','spend-b@hulog.test','{"full_name":"Bea"}'),
 ('73000000-0000-0000-0000-000000000003','spend-c@hulog.test','{"full_name":"Cai"}');
create temporary table fixture(key text primary key,val text);
grant all on fixture to authenticated,anon;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$select val::uuid from fixture where key=k$$;

-- Structure and grants.
select ok((select relrowsecurity from pg_class where oid='public.savings_spends'::regclass),'RLS is enabled on savings_spends');
select ok(not has_table_privilege('anon','public.savings_spends','SELECT,INSERT,UPDATE,DELETE'),'Anon has no spend privileges');
select ok(has_table_privilege('authenticated','public.savings_spends','SELECT'),'Authenticated can read spends');
select ok(not has_table_privilege('authenticated','public.savings_spends','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated cannot write spends directly');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_wishlist_bought' and p.pronargs=2),'The two-argument set_wishlist_bought is gone');
select ok(has_function_privilege('authenticated','public.set_wishlist_bought(uuid,boolean,boolean)','execute'),'Authenticated can mark bought');
select ok(not has_function_privilege('anon','public.set_wishlist_bought(uuid,boolean,boolean)','execute'),'Anon cannot mark bought');

set local role authenticated;
-- Pair A+B with one shared flexible goal holding 600 pesos.
select pg_temp.actor(1);
insert into fixture values('group',create_group('Spend pair','Main')::text);
insert into fixture values('invite',create_invite());
select pg_temp.actor(2);
select claim_invite((select val from fixture where key='invite'));
select pg_temp.actor(1);
select review_member('73000000-0000-0000-0000-000000000002',true);
insert into fixture values('wallet',(select id from wallets where group_id=pg_temp.id('group') limit 1)::text);
insert into fixture values('goal',propose_savings_goal('Lambo fund','flexible',pg_temp.id('wallet'),null,p_target_amount_centavos=>100000,p_end_date=>hulog_today()+30)::text);
select pg_temp.actor(2);
select respond_savings_goal(pg_temp.id('goal'),'accept');
select pg_temp.actor(1);
insert into fixture values('contrib',record_savings_contribution(pg_temp.id('goal'),p_amount_centavos=>60000)::text);
select pg_temp.actor(2);
select confirm_savings_contribution(pg_temp.id('contrib'));
select pg_temp.actor(1);
insert into fixture values('lambo',add_wishlist_item('Lambo',50000,null,pg_temp.id('goal'))::text);
insert into fixture values('shoes',add_wishlist_item('Shoes',20000,null,pg_temp.id('goal'))::text);
insert into fixture values('plain',add_wishlist_item('Plain',1000,null,null)::text);

select is((select ipon_centavos from custody_summary where wallet_id=pg_temp.id('wallet')),60000::bigint,'Custody starts with the full 600 saved');
select throws_ok($$select set_wishlist_bought(pg_temp.id('plain'),true,true)$$,'P0001','Item has no linked goal','An unlinked item cannot be paid from a goal');
select throws_ok($$select set_wishlist_bought(pg_temp.id('lambo'),true,null)$$,'P0001','Goal flag required','Null goal flag rejected');

-- Partner B buys the lambo with goal money.
select pg_temp.actor(2);
select lives_ok($$select set_wishlist_bought(pg_temp.id('lambo'),true,true)$$,'Member B marks the item bought from the goal');
select is((select status from wishlist_items where id=pg_temp.id('lambo')),'bought','Item is bought');
select is((select count(*) from savings_spends where wishlist_item_id=pg_temp.id('lambo') and voided_at is null),1::bigint,'One active spend is recorded');
select is((select amount_centavos from savings_spends where wishlist_item_id=pg_temp.id('lambo')),50000::bigint,'The spend is the item price');
select is((select created_by from savings_spends where wishlist_item_id=pg_temp.id('lambo')),'73000000-0000-0000-0000-000000000002'::uuid,'Spend actor comes from auth.uid()');
select is((select spent_centavos from savings_goal_summary where id=pg_temp.id('goal')),50000::bigint,'Goal summary shows the spend');
select is((select saved_centavos from savings_goal_summary where id=pg_temp.id('goal')),60000::bigint,'Saved stays the contributed total');
select is((select ipon_centavos from custody_summary where wallet_id=pg_temp.id('wallet')),10000::bigint,'Custody drops by the price');
select is((select total_centavos from custody_summary where wallet_id=pg_temp.id('wallet')),10000::bigint,'Custody total drops by the price');
select ok(exists(select 1 from history_changes where entity='savings_spends'),'The spend shows in the Changes feed');
select lives_ok($$select set_wishlist_bought(pg_temp.id('lambo'),true,true)$$,'Marking an already bought item again is harmless');
select is((select count(*) from savings_spends where wishlist_item_id=pg_temp.id('lambo')),1::bigint,'No second spend for a repeat mark');

-- Not enough left for the shoes; buying them outside the goal still works.
select throws_ok($$select set_wishlist_bought(pg_temp.id('shoes'),true,true)$$,'P0001','Not enough saved in the goal','A spend cannot exceed what is left');
select is((select status from wishlist_items where id=pg_temp.id('shoes')),'wanted','Rejected spend leaves the item wanted');
select lives_ok($$select set_wishlist_bought(pg_temp.id('shoes'),true)$$,'Buying without the goal still works');
select is((select count(*) from savings_spends where wishlist_item_id=pg_temp.id('shoes')),0::bigint,'Buying without the goal records no spend');

-- Undo bought voids the spend and gives the money back to the goal.
select pg_temp.actor(1);
select lives_ok($$select set_wishlist_bought(pg_temp.id('lambo'),false)$$,'Either member can undo bought');
select is((select count(*) from savings_spends where wishlist_item_id=pg_temp.id('lambo') and voided_at is null),0::bigint,'Undo voids the spend');
select is((select voided_by from savings_spends where wishlist_item_id=pg_temp.id('lambo')),'73000000-0000-0000-0000-000000000001'::uuid,'Void actor comes from auth.uid()');
select is((select spent_centavos from savings_goal_summary where id=pg_temp.id('goal')),0::bigint,'Voided spends no longer count');
select is((select ipon_centavos from custody_summary where wallet_id=pg_temp.id('wallet')),60000::bigint,'Custody is restored');
select lives_ok($$select set_wishlist_bought(pg_temp.id('lambo'),true,true)$$,'The item can be bought from the goal again');
select is((select count(*) from savings_spends where wishlist_item_id=pg_temp.id('lambo') and voided_at is null),1::bigint,'Exactly one active spend after re-buying');

-- Outsiders and other groups see nothing.
select pg_temp.actor(3);
select is((select count(*) from savings_spends),0::bigint,'An outsider reads no spends');
select throws_ok($$select set_wishlist_bought(pg_temp.id('lambo'),false)$$,'P0001','Active membership required','An outsider cannot undo bought');

-- A withdrawal in progress blocks new spends; a withdrawn goal keeps its spends.
select pg_temp.actor(2);
select set_wishlist_bought(pg_temp.id('shoes'),false);
select pg_temp.actor(1);
select propose_withdraw_goal(pg_temp.id('goal'));
select throws_ok($$select set_wishlist_bought(pg_temp.id('shoes'),true,true)$$,'P0001','Withdrawal in progress','No spend while a withdrawal is pending');
select pg_temp.actor(2);
select respond_withdraw_goal(pg_temp.id('goal'),'confirm');
select throws_ok($$select set_wishlist_bought(pg_temp.id('shoes'),true,true)$$,'P0001','Goal is not active','No spend from a withdrawn goal');
select throws_ok($$select set_wishlist_bought(pg_temp.id('lambo'),false)$$,'P0001','Goal is already withdrawn; the spend cannot be undone','A spend from a withdrawn goal stays');
select is((select status from wishlist_items where id=pg_temp.id('lambo')),'bought','The item stays bought');

set local role anon;
select throws_ok($$select set_wishlist_bought(gen_random_uuid(),true,true)$$,'42501',null,'Anonymous cannot mark bought');
select * from finish();
rollback;
