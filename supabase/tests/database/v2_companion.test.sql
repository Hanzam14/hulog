begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;
select no_plan();

-- Test clock setup
create or replace function public.hulog_today() returns date language sql stable set search_path = public, pg_temp
as $$ select current_setting('hulog.test_date')::date $$;
select set_config('hulog.test_date', '2026-11-01', true);

-- Test users: A (owner), B (partner), C (outsider)
insert into auth.users(id, email, raw_user_meta_data) values
 ('30000000-0000-0000-0000-000000000001', 'v2-a@hulog.test', '{"full_name":"Alice"}'),
 ('30000000-0000-0000-0000-000000000002', 'v2-b@hulog.test', '{"full_name":"Bob"}'),
 ('30000000-0000-0000-0000-000000000003', 'v2-c@hulog.test', '{"full_name":"Charlie"}');

create temporary table fixture(key text primary key, val text);
grant all on fixture to authenticated;

create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-' || lpad(n::text, 12, '0'), true)::text;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select val::uuid from fixture where key=k $$;
create function pg_temp.val(k text) returns text language sql as $$ select val from fixture where key=k $$;
create function pg_temp.set_val(k text, v text) returns void language sql as $$
 insert into fixture(key, val) values(k, v) on conflict(key) do update set val=excluded.val;
$$;
create function pg_temp.set_id(k text, u uuid) returns void language sql as $$
 select pg_temp.set_val(k, u::text);
$$;

--------------------------------------------------------------------------------
-- 1. Group & Default Wallet Initialization
--------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.set_id('group', create_group('Hulog Pair', 'BPI Pot'));
select pg_temp.set_val('invite', create_invite());

-- Verify default wallet was created on create_group
select is((select count(*) from wallets where group_id = pg_temp.id('group')), 1::bigint, 'Group creation creates 1 default wallet');
select is((select label from wallets where group_id = pg_temp.id('group')), 'BPI Pot', 'Default wallet label matches pot_location');
select is((select holder_id from wallets where group_id = pg_temp.id('group')), '30000000-0000-0000-0000-000000000001'::uuid, 'Default wallet holder is owner');
select pg_temp.set_id('w_a_default', (select id from wallets where group_id = pg_temp.id('group')));

-- B joins group
select pg_temp.actor(2);
select lives_ok($$select claim_invite(pg_temp.val('invite'))$$, 'Bob claims invite');
select pg_temp.actor(1);
select lives_ok($$select review_member('30000000-0000-0000-0000-000000000002', true)$$, 'Alice accepts Bob');

--------------------------------------------------------------------------------
-- 2. Wallet Creation, Rename, and Archive Protection
--------------------------------------------------------------------------------
select pg_temp.actor(2);
select pg_temp.set_id('w_b_maya', create_wallet('Maya'));
select is((select holder_id from wallets where id = pg_temp.id('w_b_maya')), auth.uid(), 'Bob is holder of Maya wallet');

-- Case-insensitive duplicate check
select throws_ok($$select create_wallet('  maya  ')$$, 'P0001', 'Wallet with this label already exists', 'Duplicate active wallet label rejected case-insensitively');

-- Validation
select throws_ok($$select create_wallet('   ')$$, 'P0001', 'Wallet label must be 1 to 40 characters', 'Blank label rejected');
select throws_ok($$select create_wallet(repeat('x', 41))$$, 'P0001', 'Wallet label must be 1 to 40 characters', 'Overlong label rejected');

-- Non-holder cannot update
select pg_temp.actor(1);
select throws_ok($$select update_wallet(pg_temp.id('w_b_maya'), 'Hacked')$$, 'P0001', 'Wallet holder only', 'Cannot update other member wallet');

-- Rename
select pg_temp.actor(2);
select lives_ok($$select update_wallet(pg_temp.id('w_b_maya'), 'Maya Savings')$$, 'Holder can rename wallet');
select is((select label from wallets where id = pg_temp.id('w_b_maya')), 'Maya Savings', 'Wallet label updated');

-- Alice creates GoTyme wallet
select pg_temp.actor(1);
select pg_temp.set_id('w_a_gotyme', create_wallet('GoTyme'));

-- Propose cycle using GoTyme
select pg_temp.set_id('c1', propose_cycle(5000, 10, '2026-11-02', '30000000-0000-0000-0000-000000000002', pg_temp.id('w_a_gotyme')));
select is((select wallet_id from cycles where id = pg_temp.id('c1')), pg_temp.id('w_a_gotyme'), 'Cycle proposed with GoTyme wallet');

-- Archive protection while cycle is proposed
select throws_ok($$select update_wallet(pg_temp.id('w_a_gotyme'), 'GoTyme', true)$$, 'P0001', 'Cannot archive wallet in active use', 'Cannot archive wallet referenced by proposed cycle');

-- Bob accepts cycle
select pg_temp.actor(2);
select respond_cycle(pg_temp.id('c1'), 'accept');

-- Archive protection while cycle is active accepted
select pg_temp.actor(1);
select throws_ok($$select update_wallet(pg_temp.id('w_a_gotyme'), 'GoTyme', true)$$, 'P0001', 'Cannot archive wallet in active use', 'Cannot archive wallet referenced by active accepted cycle');

--------------------------------------------------------------------------------
-- 3. Cycle Wallet Proposal & Custody Hand-off
--------------------------------------------------------------------------------
-- Propose moving cycle to Bob's wallet
select pg_temp.actor(1);
select lives_ok($$select propose_cycle_wallet(pg_temp.id('c1'), pg_temp.id('w_b_maya'))$$, 'Propose moving cycle to B wallet');
select is((select pending_wallet_id from cycles where id = pg_temp.id('c1')), pg_temp.id('w_b_maya'), 'Pending wallet set');
select is((select wallet_proposed_by from cycles where id = pg_temp.id('c1')), auth.uid(), 'Wallet proposed by Alice');

-- Proposer cannot accept own proposal
select throws_ok($$select respond_cycle_wallet(pg_temp.id('c1'), 'accept')$$, 'P0001', 'Other member must respond', 'Proposer cannot accept wallet proposal');

-- Proposer can cancel
select lives_ok($$select respond_cycle_wallet(pg_temp.id('c1'), 'cancel')$$, 'Proposer can cancel wallet proposal');
select ok((select pending_wallet_id is null from cycles where id = pg_temp.id('c1')), 'Pending wallet cleared on cancel');

-- Partner can decline
select propose_cycle_wallet(pg_temp.id('c1'), pg_temp.id('w_b_maya'));
select pg_temp.actor(2);
select lives_ok($$select respond_cycle_wallet(pg_temp.id('c1'), 'decline')$$, 'Partner can decline wallet proposal');
select ok((select pending_wallet_id is null from cycles where id = pg_temp.id('c1')), 'Pending wallet cleared on decline');

-- Partner can accept
select pg_temp.actor(1);
select propose_cycle_wallet(pg_temp.id('c1'), pg_temp.id('w_b_maya'));
select pg_temp.actor(2);
select lives_ok($$select respond_cycle_wallet(pg_temp.id('c1'), 'accept')$$, 'Partner accepts wallet proposal');
select is((select wallet_id from cycles where id = pg_temp.id('c1')), pg_temp.id('w_b_maya'), 'Cycle wallet updated to Maya');

-- Same holder moves immediately without partner proposal
select pg_temp.set_id('w_b_seabank', create_wallet('SeaBank'));
select lives_ok($$select propose_cycle_wallet(pg_temp.id('c1'), pg_temp.id('w_b_seabank'))$$, 'Same holder moves wallet immediately');
select is((select wallet_id from cycles where id = pg_temp.id('c1')), pg_temp.id('w_b_seabank'), 'Cycle wallet immediately updated to SeaBank');
select ok((select pending_wallet_id is null from cycles where id = pg_temp.id('c1')), 'No pending wallet proposal for same holder');

-- Unused wallet can now be archived
select pg_temp.actor(1);
select lives_ok($$select update_wallet(pg_temp.id('w_a_gotyme'), 'GoTyme Old', true)$$, 'Unused wallet can now be archived');
select ok((select archived_at is not null from wallets where id = pg_temp.id('w_a_gotyme')), 'Wallet is marked archived');

--------------------------------------------------------------------------------
-- 4. Payments, Notes, and Custody Summary (Cycle Close / Payout)
--------------------------------------------------------------------------------
select set_config('hulog.test_date', '2026-11-03', true);
select pg_temp.actor(1);
select pg_temp.set_id('p1', record_payment(pg_temp.id('c1'), 5, 'Initial 5 days'));
select is((select note from payments where id = pg_temp.id('p1')), 'Initial 5 days', 'Payment note recorded');

-- Note-only edit preserves status
select edit_payment(pg_temp.id('p1'), p_note => 'Updated payment note');
select is((select note from payments where id = pg_temp.id('p1')), 'Updated payment note', 'Payment note updated');
select is((select status from payments where id = pg_temp.id('p1')), 'pending', 'Status still pending');

-- Bob confirms payment
select pg_temp.actor(2);
select confirm_payment(pg_temp.id('p1'));
select is((select status from payments where id = pg_temp.id('p1')), 'confirmed', 'Payment confirmed');

-- Note-only edit on confirmed payment preserves confirmation status
select pg_temp.actor(1);
select edit_payment(pg_temp.id('p1'), p_note => 'Confirmed with new note');
select is((select status from payments where id = pg_temp.id('p1')), 'confirmed', 'Confirmed status preserved on note edit');
select is((select note from payments where id = pg_temp.id('p1')), 'Confirmed with new note', 'Note edited on confirmed payment');

-- Custody Summary before close (5 days * 5000 = 25000 centavos in SeaBank)
select is((select paluwagan_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 25000::bigint, 'Custody paluwagan has 25000 centavos');
select is((select total_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 25000::bigint, 'Custody total has 25000 centavos');

-- Fast-forward clock past cycle end_date (2026-11-02 + 10 - 1 = 2026-11-11)
select set_config('hulog.test_date', '2026-11-12', true);
-- Receiver is Bob, wallet holder is Bob -> auto-receives
select is((select payout_state from cycle_summary where id = pg_temp.id('c1')), 'Received', 'Cycle auto-receives because receiver is holder');

-- Custody Summary after payout: funds leave custody summary
select is((select paluwagan_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 0::bigint, 'Received cycle funds leave custody summary');
select is((select total_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 0::bigint, 'Total custody drops to 0 after payout received');

--------------------------------------------------------------------------------
-- 5. Savings Goals ("Ipon Goals") - Matched & Flexible
--------------------------------------------------------------------------------
-- Matched mode: 3-day cadence, 4 steps, 10000 centavos step
select pg_temp.actor(1);
select pg_temp.set_id('g_matched', propose_savings_goal('Vacation Fund', 'matched', pg_temp.id('w_a_default'), '2026-11-13', 10000, 3, 4));
select is((select target_amount_centavos from savings_goals where id = pg_temp.id('g_matched')), 80000::bigint, 'Matched target calculated as step * num_steps * 2');
select is((select end_date from savings_goals where id = pg_temp.id('g_matched')), '2026-11-22'::date, 'End date = start + (4-1)*3');

select pg_temp.actor(2);
select respond_savings_goal(pg_temp.id('g_matched'), 'accept');
select is((select status from savings_goals where id = pg_temp.id('g_matched')), 'accepted', 'Matched goal accepted');

-- Flexible mode
select pg_temp.actor(2);
select pg_temp.set_id('g_flex', propose_savings_goal('Emergency Fund', 'flexible', pg_temp.id('w_b_seabank'), '2026-11-13', p_target_amount_centavos => 100000, p_end_date => '2026-12-13'));
select pg_temp.actor(1);
select respond_savings_goal(pg_temp.id('g_flex'), 'accept');

-- 3-Goal Cap & Expired Proposal Exclusion
select pg_temp.actor(1);
select pg_temp.set_id('g_third', propose_savings_goal('Laptop Fund', 'flexible', pg_temp.id('w_a_default'), '2026-11-14', p_target_amount_centavos => 50000, p_end_date => '2026-12-14'));

-- 4th proposal rejected
select throws_ok($$select propose_savings_goal('Fourth Fund', 'flexible', pg_temp.id('w_a_default'), '2026-11-14', p_target_amount_centavos => 20000, p_end_date => '2026-12-14')$$, 'P0001', 'Maximum of 3 active savings goals reached', 'Active goal cap of 3 enforced');

-- Expire goal 3 by passing start_date without accepting
select set_config('hulog.test_date', '2026-11-15', true);
select is((select phase from savings_goal_summary where id = pg_temp.id('g_third')), 'expired', 'Unaccepted proposal past start date has phase expired');

-- New proposal succeeds because expired proposal is excluded from cap
select lives_ok($$select propose_savings_goal('Car Fund', 'flexible', pg_temp.id('w_a_default'), '2026-11-16', p_target_amount_centavos => 20000, p_end_date => '2026-12-16')$$, 'Expired proposal does not count against 3-goal cap');

-- Matched Goal Contribution Caps
select pg_temp.actor(1);
select pg_temp.set_id('sc_m1', record_savings_contribution(pg_temp.id('g_matched'), p_steps => 2, p_note => 'First 2 steps'));
select is((select amount_centavos from savings_contributions where id = pg_temp.id('sc_m1')), 20000::bigint, 'Contribution amount computed from steps * step_amount');

-- 3 more steps exceeds member cap of 4
select throws_ok($$select record_savings_contribution(pg_temp.id('g_matched'), p_steps => 3)$$, 'P0001', 'Steps exceed goal cap', 'Contribution exceeding member step cap rejected');

-- 2 more steps succeeds
select pg_temp.set_id('sc_m2', record_savings_contribution(pg_temp.id('g_matched'), p_steps => 2));

-- last_edited_by Confirmation Rule
select throws_ok($$select confirm_savings_contribution(pg_temp.id('sc_m1'))$$, 'P0001', 'Other member must confirm', 'Creator cannot confirm own contribution');

-- Bob edits sc_m1
select pg_temp.actor(2);
select lives_ok($$select edit_savings_contribution(pg_temp.id('sc_m1'), p_steps => 1)$$, 'Partner edits contribution steps');
select is((select last_edited_by from savings_contributions where id = pg_temp.id('sc_m1')), auth.uid(), 'last_edited_by set to Bob');

-- Bob cannot confirm because he was the last editor
select throws_ok($$select confirm_savings_contribution(pg_temp.id('sc_m1'))$$, 'P0001', 'Other member must confirm', 'Last editor Bob cannot confirm contribution');

-- Alice CAN confirm
select pg_temp.actor(1);
select lives_ok($$select confirm_savings_contribution(pg_temp.id('sc_m1'))$$, 'Alice confirms Bob-edited contribution');
select is((select status from savings_contributions where id = pg_temp.id('sc_m1')), 'confirmed', 'Contribution is confirmed');

-- Two-Step Confirmed Contribution Deletion
select lives_ok($$select edit_savings_contribution(pg_temp.id('sc_m1'), p_delete => true)$$, 'Propose deletion of confirmed contribution');
select is((select delete_proposed_by from savings_contributions where id = pg_temp.id('sc_m1')), auth.uid(), 'delete_proposed_by is Alice');
select ok((select deleted_at is null from savings_contributions where id = pg_temp.id('sc_m1')), 'Confirmed contribution not deleted immediately');

-- Alice cannot confirm own delete proposal
select throws_ok($$select respond_delete_savings_contribution(pg_temp.id('sc_m1'), 'confirm')$$, 'P0001', 'Other member must respond', 'Cannot respond to own delete proposal');

-- Bob declines
select pg_temp.actor(2);
select lives_ok($$select respond_delete_savings_contribution(pg_temp.id('sc_m1'), 'decline')$$, 'Partner declines delete proposal');
select ok((select delete_proposed_by is null from savings_contributions where id = pg_temp.id('sc_m1')), 'delete_proposed_by cleared on decline');

-- Alice proposes again, Bob confirms
select pg_temp.actor(1);
select edit_savings_contribution(pg_temp.id('sc_m1'), p_delete => true);
select pg_temp.actor(2);
select lives_ok($$select respond_delete_savings_contribution(pg_temp.id('sc_m1'), 'confirm')$$, 'Partner confirms delete proposal');
select ok((select deleted_at is not null from savings_contributions where id = pg_temp.id('sc_m1')), 'Contribution is soft-deleted');

-- Flexible Goal Contributions & Target Cap
select pg_temp.actor(1);
select pg_temp.set_id('sc_f1', record_savings_contribution(pg_temp.id('g_flex'), p_amount_centavos => 60000));
select pg_temp.actor(2);
select throws_ok($$select record_savings_contribution(pg_temp.id('g_flex'), p_amount_centavos => 50000)$$, 'P0001', 'Contribution exceeds goal target', 'Contribution exceeding target cap rejected');
select pg_temp.set_id('sc_f2', record_savings_contribution(pg_temp.id('g_flex'), p_amount_centavos => 40000));

select confirm_savings_contribution(pg_temp.id('sc_f1'));
select pg_temp.actor(1);
select confirm_savings_contribution(pg_temp.id('sc_f2'));

-- Custody Summary shows Ipon goal funds (100000 centavos in SeaBank)
select is((select ipon_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 100000::bigint, 'Custody ipon shows 100000 centavos');

-- Withdrawal Blocking when contributions are pending
select edit_savings_contribution(pg_temp.id('sc_f2'), p_delete => true);
select pg_temp.actor(2);
select respond_delete_savings_contribution(pg_temp.id('sc_f2'), 'confirm');

-- Record a pending contribution of 10000
select pg_temp.set_id('sc_pending', record_savings_contribution(pg_temp.id('g_flex'), p_amount_centavos => 10000));

-- Withdrawal proposal blocked by pending contribution
select throws_ok($$select propose_withdraw_goal(pg_temp.id('g_flex'))$$, 'P0001', 'Cannot propose withdrawal with pending contributions or pending deletions', 'Pending contribution blocks withdrawal');

-- Soft-delete pending contribution (immediate soft delete)
select edit_savings_contribution(pg_temp.id('sc_pending'), p_delete => true);
select ok((select deleted_at is not null from savings_contributions where id = pg_temp.id('sc_pending')), 'Pending contribution immediately soft-deleted');

-- Now propose withdrawal succeeds
select lives_ok($$select propose_withdraw_goal(pg_temp.id('g_flex'))$$, 'Propose withdrawal succeeds when no pending contributions');

-- Contributions blocked during withdrawal proposal
select throws_ok($$select record_savings_contribution(pg_temp.id('g_flex'), p_amount_centavos => 5000)$$, 'P0001', 'Withdrawal in progress', 'New contribution blocked while withdrawal proposed');

-- Two-step withdrawal confirmation
select throws_ok($$select respond_withdraw_goal(pg_temp.id('g_flex'), 'confirm')$$, 'P0001', 'Other member must respond', 'Proposer cannot confirm withdrawal');

select pg_temp.actor(1);
select lives_ok($$select respond_withdraw_goal(pg_temp.id('g_flex'), 'confirm')$$, 'Partner confirms withdrawal');
select ok((select withdrawn_at is not null from savings_goals where id = pg_temp.id('g_flex')), 'Goal is withdrawn');

-- Custody Summary after withdrawal: funds leave custody summary
select is((select ipon_centavos from custody_summary where wallet_id = pg_temp.id('w_b_seabank')), 0::bigint, 'Withdrawn goal funds leave custody summary');

--------------------------------------------------------------------------------
-- 6. Abono Tracker (abono_entries & abono_summary)
--------------------------------------------------------------------------------
-- Expense Entry: Alice pays 100000 for groceries, Bob owes 50000
select pg_temp.actor(1);
select pg_temp.set_id('ab_e1', record_abono_entry('expense', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Groceries', 100000, 50000, '2026-11-15', 'Shared food'));

-- Creator cannot confirm
select throws_ok($$select confirm_abono_entry(pg_temp.id('ab_e1'))$$, 'P0001', 'Other member must confirm', 'Creator cannot confirm abono expense');

-- Partner confirms
select pg_temp.actor(2);
select lives_ok($$select confirm_abono_entry(pg_temp.id('ab_e1'))$$, 'Partner confirms abono expense');
select is((select status from abono_entries where id = pg_temp.id('ab_e1')), 'confirmed', 'Abono expense confirmed');

-- Net Abono Summary
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 50000::bigint, 'Bob owes Alice 50000 centavos');
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000001' and creditor_id = '30000000-0000-0000-0000-000000000002'), 0::bigint, 'Alice owes Bob 0 centavos');

-- Settlement Creation & Caps
select pg_temp.set_id('ab_s1', record_abono_entry('settlement', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'GCash partial', 30000, 30000));
select is((select pending_settlement_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 30000::bigint, 'Pending settlement reflected in summary');

-- Second settlement exceeding cap (30000 pending + 30000 new = 60000 > 50000)
select throws_ok($$select record_abono_entry('settlement', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Over settlement', 30000, 30000)$$, 'P0001', 'Settlement exceeds owed balance', 'Settlement exceeding net owed rejected');

-- Valid remaining settlement of 20000 (total pending 50000 <= 50000)
select pg_temp.set_id('ab_s2', record_abono_entry('settlement', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'GCash remaining', 20000, 20000));

-- Alice confirms first settlement (30000)
select pg_temp.actor(1);
select confirm_abono_entry(pg_temp.id('ab_s1'));
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 20000::bigint, 'Net owed drops to 20000 after confirmed settlement');

-- Confirm-Time Cap Re-Check:
-- Bob pays 30000 for dinner, Alice owes 15000
select pg_temp.actor(2);
select pg_temp.set_id('ab_e2', record_abono_entry('expense', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Dinner', 30000, 15000));
select pg_temp.actor(1);
select confirm_abono_entry(pg_temp.id('ab_e2'));

-- Net owed from Bob to Alice is now 20000 - 15000 = 5000
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 5000::bigint, 'Net owed reduced to 5000 after new expense');

-- Confirming 20000 settlement ab_s2 now fails because 20000 > 5000!
select throws_ok($$select confirm_abono_entry(pg_temp.id('ab_s2'))$$, 'P0001', 'Settlement exceeds owed balance', 'Confirm-time settlement cap re-check rejects over-settlement');

-- Bob edits settlement to 5000
select pg_temp.actor(2);
select lives_ok($$select edit_abono_entry(pg_temp.id('ab_s2'), p_total_amount_centavos => 5000, p_owed_amount_centavos => 5000)$$, 'Edit settlement to matched balance');

-- Alice confirms adjusted settlement
select pg_temp.actor(1);
select lives_ok($$select confirm_abono_entry(pg_temp.id('ab_s2'))$$, 'Alice confirms adjusted settlement');
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 0::bigint, 'Net owed is now 0');

-- Regression 1: Note-only edit on a confirmed settlement when debt is fully settled (net owed = 0)
select pg_temp.actor(2);
select lives_ok($$select edit_abono_entry(pg_temp.id('ab_s2'), p_note => 'GCash ref #9999')$$, 'Note-only edit on confirmed settlement succeeds even when net owed is 0');
select is((select status from abono_entries where id = pg_temp.id('ab_s2')), 'confirmed', 'Note-only edit on confirmed settlement keeps status confirmed');
select is((select note from abono_entries where id = pg_temp.id('ab_s2')), 'GCash ref #9999', 'Settlement note updated');

-- Regression 2: Editing amount on a confirmed settlement excludes its own prior confirmed amount from cap check
-- Currently Bob's expenses owed to Alice = 50000 - 15000 = 35000, settled by ab_s1 (30000) + ab_s2 (5000).
-- Editing ab_s1 (30000) to 35000 would exceed remaining (35000 - 5000 = 30000), so 30100 fails while 25000 succeeds:
select throws_ok($$select edit_abono_entry(pg_temp.id('ab_s1'), p_total_amount_centavos => 30100, p_owed_amount_centavos => 30100)$$, 'P0001', 'Settlement exceeds owed balance', 'Editing confirmed settlement above underlying net owed fails');
select lives_ok($$select edit_abono_entry(pg_temp.id('ab_s1'), p_total_amount_centavos => 25000, p_owed_amount_centavos => 25000)$$, 'Editing confirmed settlement within underlying net owed succeeds');
select is((select status from abono_entries where id = pg_temp.id('ab_s1')), 'pending', 'Edited confirmed settlement resets to pending');
select pg_temp.actor(1);
select lives_ok($$select confirm_abono_entry(pg_temp.id('ab_s1'))$$, 'Alice re-confirms edited settlement');
select pg_temp.actor(2);
select lives_ok($$select edit_abono_entry(pg_temp.id('ab_s1'), p_total_amount_centavos => 30000, p_owed_amount_centavos => 30000)$$, 'Bob restores settlement to 30000');
select pg_temp.actor(1);
select lives_ok($$select confirm_abono_entry(pg_temp.id('ab_s1'))$$, 'Alice confirms restored 30000 settlement');

-- last_edited_by Rule on Abono
select pg_temp.set_id('ab_e3', record_abono_entry('expense', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Grab taxi', 10000, 5000));
select pg_temp.actor(2);
select edit_abono_entry(pg_temp.id('ab_e3'), p_description => 'Grab taxi to mall');
select is((select last_edited_by from abono_entries where id = pg_temp.id('ab_e3')), auth.uid(), 'last_edited_by set to Bob');

select throws_ok($$select confirm_abono_entry(pg_temp.id('ab_e3'))$$, 'P0001', 'Other member must confirm', 'Last editor Bob cannot confirm abono entry');
select pg_temp.actor(1);
select lives_ok($$select confirm_abono_entry(pg_temp.id('ab_e3'))$$, 'Alice can confirm Bob-edited entry');

-- Two-Step Confirmed Expense Deletion
select pg_temp.actor(2);
select lives_ok($$select edit_abono_entry(pg_temp.id('ab_e3'), p_delete => true)$$, 'Propose deletion of confirmed expense');
select is((select delete_proposed_by from abono_entries where id = pg_temp.id('ab_e3')), auth.uid(), 'delete_proposed_by set to Bob');
select ok((select deleted_at is null from abono_entries where id = pg_temp.id('ab_e3')), 'Confirmed expense not deleted immediately');

select throws_ok($$select respond_delete_abono_entry(pg_temp.id('ab_e3'), 'confirm')$$, 'P0001', 'Other member must respond', 'Cannot confirm own delete proposal');
select pg_temp.actor(1);
select lives_ok($$select respond_delete_abono_entry(pg_temp.id('ab_e3'), 'confirm')$$, 'Partner confirms expense deletion');
select ok((select deleted_at is not null from abono_entries where id = pg_temp.id('ab_e3')), 'Expense soft-deleted');
select is((select owed_centavos from abono_summary where debtor_id = '30000000-0000-0000-0000-000000000002' and creditor_id = '30000000-0000-0000-0000-000000000001'), 0::bigint, 'Net owed drops back to 0 after expense deleted');

--------------------------------------------------------------------------------
-- 7. Permissions & Grants Verification
--------------------------------------------------------------------------------
reset role;
select ok(has_function_privilege('authenticated', 'public.create_wallet(text)', 'execute'), 'Authenticated create_wallet grant');
select ok(not has_function_privilege('anon', 'public.create_wallet(text)', 'execute'), 'Anon cannot create_wallet');
select ok(has_function_privilege('authenticated', 'public.propose_savings_goal(text,text,uuid,date,bigint,integer,integer,bigint,date)', 'execute'), 'Authenticated propose_savings_goal grant');
select ok(not has_function_privilege('anon', 'public.propose_savings_goal(text,text,uuid,date,bigint,integer,integer,bigint,date)', 'execute'), 'Anon cannot propose_savings_goal');
select ok(has_function_privilege('authenticated', 'public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)', 'execute'), 'Authenticated record_abono_entry grant');
select ok(not has_function_privilege('anon', 'public.record_abono_entry(text,uuid,uuid,text,bigint,bigint,date,text)', 'execute'), 'Anon cannot record_abono_entry');

select ok((select not bool_or(has_table_privilege('anon', v, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  from unnest(array['public.cycle_summary','public.savings_goal_summary','public.savings_member_progress','public.custody_summary','public.abono_summary']) v),
  'Anon has no privileges on v2 views');
select ok((select not bool_or(has_table_privilege('authenticated', v, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  from unnest(array['public.cycle_summary','public.savings_goal_summary','public.savings_member_progress','public.custody_summary','public.abono_summary']) v),
  'Authenticated has no write privileges on v2 views');
select ok((select bool_and(has_table_privilege('authenticated', v, 'SELECT'))
  from unnest(array['public.cycle_summary','public.savings_goal_summary','public.savings_member_progress','public.custody_summary','public.abono_summary']) v),
  'Authenticated can read v2 views');

select * from finish();
rollback;
