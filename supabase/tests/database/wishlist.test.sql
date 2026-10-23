begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select plan(91);
insert into auth.users(id,email,raw_user_meta_data) values
 ('72000000-0000-0000-0000-000000000001','wish-a@hulog.test','{"full_name":"Ana"}'),
 ('72000000-0000-0000-0000-000000000002','wish-b@hulog.test','{"full_name":"Bea"}'),
 ('72000000-0000-0000-0000-000000000003','wish-c@hulog.test','{"full_name":"Cai"}'),
 ('72000000-0000-0000-0000-000000000004','wish-d@hulog.test','{"full_name":"Dan"}');
create temporary table fixture(key text primary key,val text);
grant all on fixture to authenticated,anon;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-'||lpad(n::text,12,'0'),true)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$select val::uuid from fixture where key=k$$;

-- Structure and grants (checked as the table owner before switching role).
select ok((select relrowsecurity from pg_class where oid='public.wishlist_items'::regclass),'RLS is enabled on wishlist_items');
select is((select count(*) from pg_policies where schemaname='public' and tablename='wishlist_items'),1::bigint,'Exactly one policy exists');
select is((select cmd from pg_policies where schemaname='public' and tablename='wishlist_items'),'SELECT','The only policy is for select');
select ok(not has_table_privilege('anon','public.wishlist_items','SELECT,INSERT,UPDATE,DELETE'),'Anon has no table privileges');
select ok(has_table_privilege('authenticated','public.wishlist_items','SELECT'),'Authenticated can select');
select ok(not has_table_privilege('authenticated','public.wishlist_items','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated has no write privileges');
select ok(not has_function_privilege('anon','public.add_wishlist_item(text,bigint,text,uuid)','execute'),'Anon cannot execute add_wishlist_item');
select ok(not has_function_privilege('anon','public.edit_wishlist_item(uuid,text,bigint,text,uuid)','execute'),'Anon cannot execute edit_wishlist_item');
select ok(not has_function_privilege('anon','public.set_wishlist_bought(uuid,boolean)','execute'),'Anon cannot execute set_wishlist_bought');
select ok(not has_function_privilege('anon','public.delete_wishlist_item(uuid)','execute'),'Anon cannot execute delete_wishlist_item');
select ok(has_function_privilege('authenticated','public.add_wishlist_item(text,bigint,text,uuid)','execute')
 and has_function_privilege('authenticated','public.edit_wishlist_item(uuid,text,bigint,text,uuid)','execute')
 and has_function_privilege('authenticated','public.set_wishlist_bought(uuid,boolean)','execute')
 and has_function_privilege('authenticated','public.delete_wishlist_item(uuid)','execute'),'Authenticated can execute the four wishlist RPCs');
select ok(not has_function_privilege('authenticated','private.lock_wishlist_item(uuid)','execute')
 and not has_function_privilege('authenticated','private.check_wishlist_fields(uuid,text,bigint,text,uuid)','execute'),'Private helpers are not executable by API roles');

set local role authenticated;
-- Pair A+B in group 1, outsider C, and D owns a separate group 2 with a goal.
select pg_temp.actor(1);
insert into fixture values('group',create_group('Wish pair','Main')::text);
insert into fixture values('invite',create_invite());
select pg_temp.actor(2);
select claim_invite((select val from fixture where key='invite'));
select pg_temp.actor(1);
select review_member('72000000-0000-0000-0000-000000000002',true);
select pg_temp.actor(4);
insert into fixture values('group2',create_group('Other pair','Main')::text);
insert into fixture values('goal_other',propose_savings_goal('Other goal','flexible',(select id from wallets where group_id=pg_temp.id('group2')),null,p_target_amount_centavos=>100000,p_end_date=>hulog_today()+30)::text);

-- Member A adds; member B reads the shared list.
select pg_temp.actor(1);
insert into fixture values('item',add_wishlist_item('  Rice cooker  ',250000,'   ')::text);
select is((select title from wishlist_items where id=pg_temp.id('item')),'Rice cooker','Title is trimmed');
select is((select price_centavos from wishlist_items where id=pg_temp.id('item')),250000::bigint,'Price is stored as integer centavos');
select ok((select note is null from wishlist_items where id=pg_temp.id('item')),'Blank note is stored as null');
select is((select added_by from wishlist_items where id=pg_temp.id('item')),auth.uid(),'added_by comes from auth.uid()');
select is((select group_id from wishlist_items where id=pg_temp.id('item')),pg_temp.id('group'),'Group comes from the active membership');
select is((select status from wishlist_items where id=pg_temp.id('item')),'wanted','New items are wanted');
select pg_temp.actor(2);
select is((select count(*) from wishlist_items),1::bigint,'Member B reads the shared item');
select is((select added_by from wishlist_items where id=pg_temp.id('item')),'72000000-0000-0000-0000-000000000001'::uuid,'Member B sees who added it');

-- Validation.
select pg_temp.actor(1);
select throws_ok($$select add_wishlist_item('',100)$$,'P0001','Wishlist title must be 1 to 60 characters','Empty title rejected');
select throws_ok($$select add_wishlist_item('   ',100)$$,'P0001','Wishlist title must be 1 to 60 characters','Whitespace title rejected');
select throws_ok($$select add_wishlist_item(null,100)$$,'P0001','Wishlist title must be 1 to 60 characters','Null title rejected');
select throws_ok($$select add_wishlist_item(repeat('x',61),100)$$,'P0001','Wishlist title must be 1 to 60 characters','61-character title rejected');
select lives_ok($$select add_wishlist_item(repeat('x',60),100)$$,'60-character title accepted');
select throws_ok($$select add_wishlist_item('Free',0)$$,'P0001','Invalid wishlist price','Zero price rejected');
select throws_ok($$select add_wishlist_item('Negative',-5)$$,'P0001','Invalid wishlist price','Negative price rejected');
select throws_ok($$select add_wishlist_item('No price',null)$$,'P0001','Invalid wishlist price','Null price rejected');
select throws_ok($$select add_wishlist_item('Huge',10000000001)$$,'P0001','Invalid wishlist price','Price above the ledger maximum rejected');
select throws_ok($$select add_wishlist_item('Long note',100,repeat('n',141))$$,'P0001','Note must be at most 140 characters','141-character note rejected');
select lives_ok($$select add_wishlist_item('Max note',100,repeat('n',140))$$,'140-character note accepted');
select throws_ok($$select add_wishlist_item('Ghost',100,null,gen_random_uuid())$$,'P0001','Linked goal must be an active shared ipon goal in your group','Unknown linked goal rejected');
select throws_ok($$select add_wishlist_item('Spy',100,null,pg_temp.id('goal_other'))$$,'P0001','Linked goal must be an active shared ipon goal in your group','Goal from another group rejected');

-- Linked goals: proposed and accepted are fine; withdrawn and cancelled are not.
insert into fixture values('goal',propose_savings_goal('Appliances','flexible',(select id from wallets where group_id=pg_temp.id('group')),null,p_target_amount_centavos=>300000,p_end_date=>hulog_today()+30)::text);
select lives_ok($$select add_wishlist_item('Linked to proposed',100,null,pg_temp.id('goal'))$$,'Proposed shared goal can be linked');
select pg_temp.actor(2);
select respond_savings_goal(pg_temp.id('goal'),'accept');
select pg_temp.actor(1);
insert into fixture values('linked',add_wishlist_item('Linked to accepted',100,'for the kitchen',pg_temp.id('goal'))::text);
select is((select linked_goal_id from wishlist_items where id=pg_temp.id('linked')),pg_temp.id('goal'),'Accepted shared goal can be linked');
insert into fixture values('goal_cancelled',propose_savings_goal('Cancelled goal','flexible',(select id from wallets where group_id=pg_temp.id('group')),null,p_target_amount_centavos=>100000,p_end_date=>hulog_today()+30)::text);
select respond_savings_goal(pg_temp.id('goal_cancelled'),'cancel');
select throws_ok($$select add_wishlist_item('Cancelled link',100,null,pg_temp.id('goal_cancelled'))$$,'P0001','Linked goal must be an active shared ipon goal in your group','Cancelled goal rejected');
insert into fixture values('goal_withdrawn',propose_savings_goal('Withdrawn goal','flexible',(select id from wallets where group_id=pg_temp.id('group')),null,p_target_amount_centavos=>100000,p_end_date=>hulog_today()+30)::text);
select pg_temp.actor(2);
select respond_savings_goal(pg_temp.id('goal_withdrawn'),'accept');
select propose_withdraw_goal(pg_temp.id('goal_withdrawn'));
select pg_temp.actor(1);
select respond_withdraw_goal(pg_temp.id('goal_withdrawn'),'confirm');
select throws_ok($$select add_wishlist_item('Withdrawn link',100,null,pg_temp.id('goal_withdrawn'))$$,'P0001','Linked goal must be an active shared ipon goal in your group','Withdrawn goal rejected');

-- Edit: either member while wanted; replaces all fields; validates like add.
select pg_temp.actor(2);
select lives_ok($$select edit_wishlist_item(pg_temp.id('item'),'Big rice cooker',300000,'Zojirushi',pg_temp.id('goal'))$$,'Member B edits member A item');
select is((select title||'|'||price_centavos||'|'||note||'|'||(linked_goal_id=pg_temp.id('goal')) from wishlist_items where id=pg_temp.id('item')),'Big rice cooker|300000|Zojirushi|true','Edit replaced every field');
select is((select added_by from wishlist_items where id=pg_temp.id('item')),'72000000-0000-0000-0000-000000000001'::uuid,'Edit keeps the original adder');
select lives_ok($$select edit_wishlist_item(pg_temp.id('item'),'Big rice cooker',300000)$$,'Edit with no note or goal clears them');
select ok((select note is null and linked_goal_id is null from wishlist_items where id=pg_temp.id('item')),'Note and link were cleared');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'',300000)$$,'P0001','Wishlist title must be 1 to 60 characters','Edit validates title');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Ok',0)$$,'P0001','Invalid wishlist price','Edit validates price');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Ok',100,repeat('n',141))$$,'P0001','Note must be at most 140 characters','Edit validates note length');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Ok',100,null,pg_temp.id('goal_other'))$$,'P0001','Linked goal must be an active shared ipon goal in your group','Edit rejects a goal from another group');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Ok',100,null,pg_temp.id('goal_withdrawn'))$$,'P0001','Linked goal must be an active shared ipon goal in your group','Edit rejects a withdrawn goal');
select is((select title from wishlist_items where id=pg_temp.id('item')),'Big rice cooker','Failed edits changed nothing');

-- Bought toggle records who and when; no editing while bought.
select lives_ok($$select set_wishlist_bought(pg_temp.id('item'),true)$$,'Member B marks the item bought');
select is((select status from wishlist_items where id=pg_temp.id('item')),'bought','Status becomes bought');
select is((select bought_by from wishlist_items where id=pg_temp.id('item')),auth.uid(),'bought_by is the actor');
select ok((select bought_at is not null from wishlist_items where id=pg_temp.id('item')),'bought_at is set');
select pg_temp.actor(1);
select lives_ok($$select set_wishlist_bought(pg_temp.id('item'),true)$$,'Marking an already bought item is harmless');
select is((select bought_by from wishlist_items where id=pg_temp.id('item')),'72000000-0000-0000-0000-000000000002'::uuid,'The original buyer is kept');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Changed',100)$$,'P0001','Bought items cannot be edited','Bought items cannot be edited');
select throws_ok($$select set_wishlist_bought(pg_temp.id('item'),null)$$,'P0001','Bought flag required','Null bought flag rejected');
select lives_ok($$select set_wishlist_bought(pg_temp.id('item'),false)$$,'Either member can undo bought');
select ok((select status='wanted' and bought_by is null and bought_at is null from wishlist_items where id=pg_temp.id('item')),'Undo clears bought_by and bought_at');
select lives_ok($$select edit_wishlist_item(pg_temp.id('item'),'Rice cooker again',100)$$,'Editing works again once wanted');

-- History: group-shared audit trail.
select ok((select count(*)>=4 from history where entity='wishlist_items' and entity_id=pg_temp.id('item')),'Adds, edits and bought toggles are audited');
select ok(exists(select 1 from history where entity='wishlist_items' and entity_id=pg_temp.id('item') and action='update' and "after"->>'status'='bought' and actor_id='72000000-0000-0000-0000-000000000002'),'Bought toggle audited with the actor');

-- Soft delete.
select pg_temp.actor(2);
select lives_ok($$select delete_wishlist_item(pg_temp.id('item'))$$,'Either member soft deletes');
select is((select count(*) from wishlist_items where id=pg_temp.id('item')),0::bigint,'Deleted item is hidden from the list');
select pg_temp.actor(1);
select is((select count(*) from wishlist_items where id=pg_temp.id('item')),0::bigint,'Deleted item is hidden from the other member too');
select ok(exists(select 1 from history where entity='wishlist_items' and entity_id=pg_temp.id('item') and action='delete'),'Delete is kept in history');
select throws_ok($$select edit_wishlist_item(pg_temp.id('item'),'Back',100)$$,'P0001','Wishlist item unavailable','Deleted item cannot be edited');
select throws_ok($$select set_wishlist_bought(pg_temp.id('item'),true)$$,'P0001','Wishlist item unavailable','Deleted item cannot be marked bought');
select throws_ok($$select delete_wishlist_item(pg_temp.id('item'))$$,'P0001','Wishlist item unavailable','Deleted item cannot be deleted again');
select lives_ok($$select set_wishlist_bought(pg_temp.id('linked'),true)$$,'Mark a second item bought');
select lives_ok($$select delete_wishlist_item(pg_temp.id('linked'))$$,'Bought items can be deleted');

-- Direct writes are denied even to members.
select throws_ok($$insert into wishlist_items(group_id,title,price_centavos,added_by) values(pg_temp.id('group'),'Bypass',1,auth.uid())$$,'42501',null,'Direct insert denied');
select throws_ok($$update wishlist_items set title='Hacked'$$,'42501',null,'Direct update denied');
select throws_ok($$delete from wishlist_items$$,'42501',null,'Direct delete denied');

insert into fixture values('foreign',add_wishlist_item('Pair only',100)::text);

-- Cap of 30 live items; deleted items do not count.
select add_wishlist_item('Bulk ' || n, 100) from generate_series(1, 30 - (select count(*)::integer from wishlist_items)) n;
select is((select count(*) from wishlist_items),30::bigint,'List is filled to 30 items');
select throws_ok($$select add_wishlist_item('One too many',100)$$,'P0001','Maximum of 30 wishlist items reached','The 31st item is rejected');
select pg_temp.actor(2);
select throws_ok($$select add_wishlist_item('Partner too many',100)$$,'P0001','Maximum of 30 wishlist items reached','The cap is per group, not per member');
select delete_wishlist_item((select id from wishlist_items order by created_at,id limit 1));
select lives_ok($$select add_wishlist_item('Fits again',100)$$,'A deleted item frees a slot');

-- Outsiders and other groups.
select pg_temp.actor(3);
select is((select count(*) from wishlist_items),0::bigint,'Non-member reads no items');
select throws_ok($$select add_wishlist_item('Outsider',100)$$,'P0001','Active membership required','Non-member cannot add');
select throws_ok($$select edit_wishlist_item(gen_random_uuid(),'Outsider',100)$$,'P0001','Active membership required','Non-member cannot edit');
select throws_ok($$select set_wishlist_bought(gen_random_uuid(),true)$$,'P0001','Active membership required','Non-member cannot mark bought');
select throws_ok($$select delete_wishlist_item(gen_random_uuid())$$,'P0001','Active membership required','Non-member cannot delete');
select pg_temp.actor(4);
select is((select count(*) from wishlist_items),0::bigint,'A member of another group reads none of this group');
select pg_temp.actor(4);
select throws_ok($$select edit_wishlist_item(pg_temp.id('foreign'),'Hijack',100)$$,'P0001','Wishlist item unavailable','Other group cannot edit this group item');
select throws_ok($$select set_wishlist_bought(pg_temp.id('foreign'),true)$$,'P0001','Wishlist item unavailable','Other group cannot mark this group item bought');
select throws_ok($$select delete_wishlist_item(pg_temp.id('foreign'))$$,'P0001','Wishlist item unavailable','Other group cannot delete this group item');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from wishlist_items$$,'42501',null,'Anonymous cannot read items');
select throws_ok($$select add_wishlist_item('Anon',100)$$,'42501',null,'Anonymous cannot add');
select throws_ok($$select edit_wishlist_item(gen_random_uuid(),'Anon',100)$$,'42501',null,'Anonymous cannot edit');
select throws_ok($$select set_wishlist_bought(gen_random_uuid(),true)$$,'42501',null,'Anonymous cannot mark bought');
select throws_ok($$select delete_wishlist_item(gen_random_uuid())$$,'42501',null,'Anonymous cannot delete');
select * from finish();
rollback;
