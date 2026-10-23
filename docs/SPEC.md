# Hulog — Build Spec (v1 + v1.1)

Hulog is an open-source (MIT) PWA for tracking a two-person "paluwagan": both members pay a fixed amount per day into a pot for N days; at the end one member receives the whole pot; the next cycle (possibly different terms) usually goes to the other member.

The app **records** money; it never moves money. Keep it simple: this is a couples app, not a bank.

## 1. Stack and constraints

- Vite + React + TypeScript, Tailwind CSS, React Router, `@supabase/supabase-js`, `vite-plugin-pwa`, `qrcode` (QR rendering). Vitest for unit tests.
- Supabase (free tier): Postgres, Auth (Google provider only), RLS on every table, SQL migrations in `supabase/migrations/`, Edge Function + `pg_cron` for v1.1 push.
- All money as **integer centavos**. All dates are **calendar dates in `Asia/Manila`**. "Today" comes only from the SQL function `hulog_today()` (= `(now() at time zone 'Asia/Manila')::date`), never the client clock, for any rule that gates a write.
- Static build deployable to Vercel/Netlify. Do **not** deploy, create a GitHub remote, or create a Supabase cloud project — the owner does that from `SETUP.md`.
- No dependencies beyond those above without a concrete need noted in the handoff.
- UI copy: English with light Taglish ("Hulog today", "Pot", "Got it", "Owes ₱X"). Mobile-first, works at 360px wide.

## 2. Roles

- **Group**: exactly one per pair; exactly 2 active members max; one group per user. Tables use a generic `memberships` table (so a fork could extend it), but all v1 rules are written for 2 people.
- **Owner/holder**: the member who created the group. Holds the pot (informational editable text "Pot held at", e.g. MariBank). Approves join requests. Both active members confirm each other’s payments; nobody confirms their own.
- **Member**: the other person.
- **Receiver**: chosen per cycle.

## 3. Data model

- `profiles(id = auth.users.id, display_name, avatar_url, email, nickname nullable, avatar_kind default 'initial', avatar_emoji nullable, color default 'auto')`. Nickname is trimmed, 1..24 characters; blank resets to the Google name. Avatar kind is `initial|emoji|photo`; photo needs a Google `avatar_url`. Emoji is one of 🐷 🐱 🐶 🐰 🐻 🐼 🐸 🐵 🦊 🐥 🌻 🌸 🍓 🥭 ⭐ 🌙. Color is `auto|pink|blue|green|orange|purple`.
- `groups(id, name, owner_id, pot_location text, created_at)`
- `memberships(group_id, user_id unique, status: pending|active|denied|removed, last_seen_history_at, created_at)` — owner is `active` on group creation. `user_id` unique ⇒ one group per user (a denied/removed row must be deleted or reused before joining elsewhere; v1: denied users can't join another group without the row being removed by its owner — acceptable).
- `invites(id, group_id, token_hash unique, created_by, created_at, expires_at = created_at + 24h, used_by, used_at, revoked_at)`.
- `cycles(id, group_id, daily_amount_centavos > 0, num_days 1..366, start_date, end_date (stored, set by RPC = start_date + num_days − 1; moved earlier only by early close, rule 8a), planned_end_date (null unless closed early), closed_early_by, closed_early_at, receiver_id, proposed_by, status: proposed|declined|cancelled|accepted, accepted_by, accepted_at, received_at, created_at)`.
- `payments(id, cycle_id, member_id, days int ≥ 1, amount_centavos (stored, computed by RPC = days × daily amount), status: pending|confirmed, was_confirmed bool default false, created_by, created_at, confirmed_by, confirmed_at, edited_at, deleted_at)`.
- `repayments(id, cycle_id, debtor_id, creditor_id, amount_centavos > 0, status: pending|confirmed, was_confirmed bool default false, created_by, created_at, confirmed_at, edited_at, deleted_at)`.
- `history(id, group_id, actor_id, entity, entity_id, action, before jsonb, after jsonb, created_at)` — append-only, written by triggers. Feeds the in-app "Changes" list; unread = rows by the other member newer than `last_seen_history_at`.
- v1.1: `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, created_at)`, `notification_prefs(user_id pk, reminder_time default '20:00', enabled bool)`, `notification_log(user_id, kind, ref_id, sent_on date, unique(user_id, kind, ref_id, sent_on))`.

### Derived (computed in SQL views/functions, never stored)

- **Cycle phase** for an `accepted` cycle, with `t = hulog_today()`:
  - `upcoming`: t < start_date
  - `open`: start_date ≤ t ≤ end_date
  - `settling`: t = end_date + 1
  - `ended`: t ≥ end_date + 2
  - A cycle is **closed** when phase ∈ {settling, ended}. There is no stored closed status and no cron for closing.
- **Live cycle** = a `proposed` cycle, or an `accepted` cycle with t ≤ end_date. At most one live cycle per group (enforced in the propose RPC under a group row lock).
- **Pot** = sum of `amount_centavos` of confirmed, non-deleted payments.
- **Expected** per member = num_days × daily amount.
- **Debt** (closed cycle, member ≠ receiver, creditor = receiver) = `max(0, expected − confirmed paid − confirmed repayments)`. The receiver's own shortfall creates no debt. Overpaid repayments never create reverse debt.
- **Payout state** (closed cycles): receiver = owner → "Received" automatically. Otherwise "Waiting for Got it" until `received_at` is set.

## 4. Rules

### Security (applies to everything)

- RLS on every table. Members can `select` only rows of the group where they are `active`. No direct insert/update/delete from clients; all writes go through `security definer` RPCs with `set search_path = public, pg_temp`, `revoke execute ... from public, anon`, and `grant execute ... to authenticated` only for the RPCs listed below.
- Every RPC derives the actor from `auth.uid()` and loads the target cycle/payment/repayment/invite **by id joined to the actor's own active group**; anything not in that group → error. Never trust ids/roles from the client.
- Derived views use `security_invoker = true`.
- Exceptions: `create_group` (actor has no membership row) and `claim_invite` (actor has no active membership) don't require membership. A pending/denied user may read only their own membership row (status). Requester name/email is visible only to that group's owner.
- Invite token: 32 random bytes, base64url, shown once; only SHA-256 stored.

### Rules

1. **Create group**: signed-in user with no membership row creates a group; becomes owner + active member.
2. **Invite**: owner creates invite → app shows `https://<host>/join/<token>` and a QR code. Owner can revoke. Expires after 24h. Creating a new invite revokes older unused ones.
3. **Join**: open link → Google sign-in → `claim_invite(token)` does, in one statement/transaction, `update invites set used_by, used_at where token_hash = sha256(token) and used_at is null and revoked_at is null and expires_at > now()`; 0 rows → "Invite invalid or used". Success creates a `pending` membership. Owner sees "Join request from <name> (<email>)" → **Accept** (`active`) or **Deny** (`denied`). Accept locks the group row and fails if there are already 2 active members. Pending/denied users see a waiting/denied screen only.
4. **Propose cycle**: any active member, when the group has no live cycle. Fields: daily amount (₱), number of days, start date (≥ today, default tomorrow), receiver (default = the member who did not receive the most recent accepted cycle; owner for the first). Proposer can cancel; the other member can **Accept** or **Decline**. Accept allowed only while today ≤ start_date (otherwise decline and re-propose).
5. **Pay ("Hulog")**: an active member records a payment for themselves of `days` whole days. Allowed only for an `accepted` cycle while today ≤ end_date (paying ahead before start is allowed). Cap: under a lock on the cycle row, (sum of days of the member's non-deleted payments, pending or confirmed) + new days ≤ num_days. Every payment starts `pending`, including the owner’s own payments.
6. **Confirm**: the other active member (not the payer) confirms pending payments while today ≤ end_date + 1. After that, pending payments stay pending and don't count ("Unconfirmed — not counted"). Exception: a payment with `was_confirmed = true` (was confirmed, then edited back to pending) can be re-confirmed by the other active member at any time. Confirming sets `was_confirmed = true`.
7. **Edit/delete payments (mistakes)**: any active member can change `days` or soft-delete any payment in the group, any time. Days cap (rule 5) still applies. Changing days on any confirmed payment sets it to `pending` (keeps `was_confirmed`) and clears `confirmed_by` / `confirmed_at`, for both members. Saving unchanged days is a no-op. Every change writes `history`.
8. **Payout**: receiver = owner → received when the cycle closes. Otherwise the receiver taps **Got it** (sets `received_at`) once the cycle is closed. After that RPC succeeds, celebrate with a brief canvas confetti burst in both members' resolved colors, gold, and contrasting ink. The other member celebrates on first seeing the received cycle; device-local `hulog-confetti-seen` ids prevent repeats (storage failure is tolerated). Reduced motion shows a static “Natanggap na! 🎉” sticker. The received card says “Congrats, {name}! Nasa'yo na ang hulog.”
   **Receiver hand-off**: `give_payout(p_cycle_id)` is callable only by the current receiver who is an active member, for an accepted cycle with `received_at` null and today ≤ end_date (including upcoming cycles). Under the cycle lock it sets `receiver_id` to the other active member and writes history. The next proposal still defaults to the member other than the most recent accepted receiver, including any hand-off. Hulog only changes the record; it does not transfer money.
8a. **Close round early**: when the pot is full, either active member can end the round before `end_date` with `close_cycle_early(p_cycle_id)`, one tap plus an in-app "are you sure" step. No proposal/confirm round: a full pot means every peso was already confirmed by the other member.
   - Allowed only for an `accepted` cycle in phase `open` (start_date ≤ today ≤ end_date) with `received_at` null, called by an active member of the cycle's group.
   - **Pot full** = every active member has confirmed, non-deleted payments totalling `num_days` days (confirmed paid = expected). Because of the days cap (rule 5) this also means no pending payment remains, so nothing waits on confirmation.
   - Under the cycle row lock it re-checks the above, stores `planned_end_date = end_date`, `closed_early_by = auth.uid()`, `closed_early_at = now()`, and sets `end_date = today − 1`. Today becomes the settling day, so the round is closed at once: payments and hand-off stop, payout (rule 8) is available now, and the round is `ended` tomorrow. All other phase, debt, payout and custody rules apply unchanged to the new `end_date`. It cannot be undone.
   - History: the cycles trigger records the change (before/after); Changes shows it as "Sinara nang maaga ang round".
   - UI: the round card shows one quiet "Isara na ang round" link only while the round is open and the pot is full.
9. **Repay debt**: debtor or creditor records a repayment against a closed cycle. Cap: new amount ≤ expected − confirmed paid − (pending + confirmed non-deleted repayments) for that cycle/debtor. Creditor confirms (any time). Repayments are outside any pot. Edit/delete like rule 7: changing amount resets a confirmed repayment to pending; creditor reconfirms; same cap applies to edits. Repayment create/edit takes the same cycle-row lock as rule 5.
10. **Caps on edits** (rules 5, 7, 9): when editing, exclude the edited row's current value from the sum before adding the new value.
11. **Export CSV**: client-side download of cycles, payments, repayments for the group.
12. **Profile**: `update_profile(p_nickname, p_avatar_kind, p_avatar_emoji, p_color)` updates only `id = auth.uid()`, validates preferences, and is granted only to authenticated users. Profiles stay select-only for clients. Google sync refreshes name/photo/email without touching preferences. Display uses nickname, then Google name; failed photos show the initial. Auto colors are owner pink / partner blue. If colors collide, owner keeps theirs and partner uses the first different color in pink, blue, green, orange, purple order.
13. **Device appearance/install**: theme is `system|light|dark` in device `localStorage` (`hulog-theme`, failure tolerated), applied before first paint; Auto follows OS changes and theme-color follows paper. Light uses dotted paper; dark uses a night planner palette with contrasting text and unchanged member fills. PWA is named **Hulog**, with portrait, maskable/touch icons, and `/hulog` + `/history` shortcuts. Android Settings offers the captured install prompt; iOS Safari shows “Share → Add to Home Screen.” Installed standalone apps hide install hints.
14. **Rename**: owner can rename the group with `update_group`, preserving the current pot location.
15. **App updates**: Settings shows package version + short Git hash (version only without Git), a manual update check, and “I-update ngayon” when a worker is waiting. A dismissible “May bagong version ng Hulog.” banner also offers “I-update”. Workers wait for the user's choice before activating and reloading; push handlers remain intact. Check on startup and foreground return, at most every 30 minutes automatically. Browser tabs and installed builds support updates; dev explains that updates require an installed or built app.

## 5. Screens

- Sign in (Google).
- No group: "Create group" or "I have an invite link".
- Join: claim → waiting / denied screen.
- Home (live/most recent cycle): terms, receiver, phase + days left, hero pot card without rotation: pig + large amount, muted target, clamped accessible pink progress bar, avatar + first name with “goes to”, and phase/days left plus daily amount × days/date range wrapping at 360px, per-member progress (days paid / num_days, pending count), big **Hulog** button (days picker), the other member’s "To confirm" list (confirm and decline X), unread Changes badge, payout card when closed.
- Propose cycle form; pending proposal card with Accept / Decline / Cancel.
- Cycle detail: payments list with edit/delete and status chips; mutual confirmation and decline actions; current receiver’s quiet “Give to {name}” button with confirmation while the hand-off window is open.
- History: past cycles with receiver, pot, payout state, debts ("Owes ₱X") + Record repayment.
- Group settings: members (tap your own avatar to open **Ikaw**), owner group-name and pot-location forms, invite (link + QR + revoke), join requests (Accept/Deny), **Itsura** (Auto / Light / Dark), install hint, Export CSV, sign out. Ikaw has a live preview, nickname (Google-name placeholder), Initial / Emoji / Photo choices (Photo hidden without Google avatar), 4×4 emoji grid, Auto + five color swatches, partner-color marker (still selectable), and Save through `update_profile`. Controls fit 360px and use large tap targets.
- v1.1 Settings: enable notifications, reminder time.

## 6. v1.1 Push notifications (build after v1 passes acceptance)

- Web Push with VAPID; service worker via `vite-plugin-pwa` (injectManifest). Permission requested only from a button tap. One subscription per device.
- Edge Function `notify`, invoked by `pg_cron` every 15 minutes, deduped via `notification_log`:
  - Reminder at the user's `reminder_time` (Manila) if the cycle is `open` and the user's paid days (pending + confirmed) < days elapsed including today.
  - "Confirm payment?" to the other active member for pending payments created since the last run.
  - "Cycle ends tomorrow" at 09:00 on end_date − 1.
  - "Payout day" at 09:00 on end_date + 1, to both.
- iOS: show an "Add to Home Screen first" helper on iOS Safari when not in standalone mode.
- Notifications never change state.

## 7. Worked example (encode as tests)

Owner **A**, member **B**.

**Cycle 1**: ₱50/day, 15 days, start 2026-11-01, end 2026-11-15, receiver B.

- A pays 15 days on 11-01 → pending; A cannot confirm their own payment. B confirms → confirmed (₱750).
- B pays 1 day on each of 11-01..11-13 (13 payments), A confirms each → B confirmed ₱650.
- 11-15 22:00: B pays 1 day (P14) → pending. 11-15 23:00: B pays 1 day (P15) → pending.
- 11-16 (settling): A confirms P14 → allowed. B confirmed = ₱700. B tries to pay → rejected (after end_date).
- 11-16: cycle 1 is closed. Pot = ₱1,450. Receiver B → "Waiting for Got it". B taps Got it.
- Debts: A expected ₱750, paid ₱750 → none. B is the receiver → no debt for B's shortfall.
- 11-17: A tries to confirm P15 → rejected (past settling day, never confirmed). P15 shows "Unconfirmed — not counted".

**Cycle 2**: B proposes on 11-16 (allowed: cycle 1 no longer live). ₱100/day, 10 days, start 11-20, end 11-29. Default receiver = A. A accepts on 11-17.

- A pays 10 days → pending; B confirms → ₱1,000 confirmed. B pays 4 days, then 3 days; A confirms both → B ₱700.
- 11-30: closed. Pot ₱1,700. Receiver A = owner → auto Received.
- Debt: B owes A 1,000 − 700 = ₱300 for Cycle 2.
- B records a ₱300 repayment; tries a second ₱1 repayment → rejected (cap). A confirms → debt ₱0. Cycle 3's pot is unaffected.
- **Correction after close (12-02)**: the 3-day entry was really 2. A edits it to 2 → it returns to pending (`was_confirmed`). B confirmed = ₱400 → debt = max(0, 1,000 − 400 − 300) = ₱300. History row written; B sees an unread badge. A re-confirms (allowed, `was_confirmed`) → B confirmed ₱600 → debt = ₱100.

**Hand-off example**: in a live accepted cycle with receiver A, B cannot take the payout. A chooses “Give to B” and confirms → receiver B, history records A and the receiver change. After the cycle closes the next proposal defaults to A. A received cycle, a proposed cycle, or any cycle past end_date cannot be handed off.

**Early close example**: ₱75 × 15 days, 10-07 → 10-21, receiver B. By 10-20 both members' 15 days are confirmed (pot ₱2,250 of ₱2,250). On 10-20 A taps "Isara na ang round" and confirms → `planned_end_date` 10-21, `end_date` 10-19; the round is settling today, B taps **Got it** now, and it is ended on 10-21. Rejected: a pot one day short, a round still upcoming, a received or already-closed round, and a caller who is not an active member of the group.

**Migration transition (2026-10-07)**: existing confirmed, non-deleted owner payments in accepted cycles with today ≤ end_date + 1 reset to pending, keep `was_confirmed = true`, and clear confirmation metadata. The payment audit trigger writes before/after history with null actor (system entry supported by the schema). Older cycles, partner payments, deleted payments, and unaccepted cycles stay unchanged.

Also test: invite reuse fails; expired and revoked invites fail; concurrent claims → exactly one succeeds; third member can't be accepted; denied/pending user can't read group data; non-member can't call RPCs on another group's ids; second live cycle can't be proposed; days over num_days rejected (including via edit); accept after start_date rejected; editing an originally-pending payment after the settling day does not make it confirmable.

## 8. Acceptance / verification

- `npm run build`, `npm run lint`, `npm test` pass.
- SQL rules tested against local Supabase (`npx supabase start`; Docker is installed) using pgTAP (`supabase test db`) or a Vitest integration suite calling RPCs as two different test users. For tests, `hulog_today()` is overridden only inside the disposable test database (e.g. the test setup replaces the function); production code has no test-clock flag.
- Manual smoke (in SETUP.md): sign in, create group, invite via QR, accept, propose/accept cycle, pay, confirm, export CSV.

## 9. Deliverables

- Repo: `README.md` (what it is, MIT), `LICENSE` (MIT), `SETUP.md` (create Supabase project, enable Google provider + redirect URLs, run migrations, env vars, deploy to Vercel, VAPID keys for v1.1, iOS home-screen note), `AGENTS.md` (startup, commands, rules summary pointing to this spec), `.env.example`, `supabase/` migrations + tests, `src/`.
- Local git repo with commits; no remote.

## 10. Hulog v2 — Couples Financial Companion (Custody, Ipon Goals & Abono Tracker)

Hulog v2 expands the app from a single-mode paluwagan tracker into a read-only couples financial companion while keeping Paluwagan as a first-class feature. All v1 invariants hold: integer centavos (`bigint`), `hulog_today()` (`Asia/Manila`), RLS on every table with `security definer` RPCs, mutual two-person confirmation, and 360px mobile usability.

### 10.1 Named Wallets & Custody Transparency (`wallets` + `custody_summary`)

- `wallets(id, group_id, holder_id, label, archived_at, created_by, created_at)`:
  - `holder_id` is immutable and must be an active member of `group_id`.
  - `label` is trimmed, 1..40 characters, unique per `(group_id, holder_id, lower(btrim(label)))` where `archived_at is null`.
  - Migration backfills one default wallet per existing group (`holder_id = owner_id`, `label = coalesce(nullif(btrim(pot_location), ''), 'Main Pot')`) and links existing `cycles.wallet_id` to it before updating `cycle_summary`.
  - `create_wallet(p_label)`: any active member creates a wallet for `holder_id = auth.uid()`.
  - `update_wallet(p_id, p_label, p_archive default false)`: only `holder_id = auth.uid()` may rename or archive their wallet. Archiving is rejected if any unreceived or proposed cycle (`wallet_id = p_id or pending_wallet_id = p_id`) or any unwithdrawn or proposed savings goal (`wallet_id = p_id or pending_wallet_id = p_id`) references it.
- **Cycle wallet & custodian hand-off**:
  - `cycles` adds `wallet_id uuid not null references wallets(id)`, `pending_wallet_id uuid references wallets(id)`, and `wallet_proposed_by uuid references profiles(id)`.
  - `propose_cycle` accepts optional `p_wallet_id uuid default null` (defaults to the proposer's earliest non-archived wallet, or the group's earliest non-archived wallet; rejects archived wallets or wallets of inactive members).
  - Auto-receive rule in `cycle_summary`: when a cycle closes (`hulog_today() > end_date`), `payout_state` is `'Received'` if `receiver_id = wallet.holder_id` or `received_at is not null`; otherwise `'Waiting for Got it'`.
  - `propose_cycle_wallet(p_cycle_id, p_wallet_id)`: allowed on an `accepted` cycle while `payout_state is distinct from 'Received'`. After `end_date`, only moves between the current holder's own non-archived wallets are allowed (only `receive_payout` ends custody). On or before `end_date`, if `new_wallet.holder_id = current_wallet.holder_id` and `auth.uid() = current_wallet.holder_id`, `wallet_id` updates immediately and clears any pending wallet proposal; otherwise `pending_wallet_id = p_wallet_id` and `wallet_proposed_by = auth.uid()` are set, requiring the other active member to call `respond_cycle_wallet(p_cycle_id, 'accept' | 'decline')` (or proposer `'cancel'`). `respond_cycle_wallet` re-verifies under the cycle lock that the target wallet is non-archived, its holder is active, and the cycle is not yet received. `receive_payout` clears `pending_wallet_id` and `wallet_proposed_by`.
- **When funds count in `custody_summary`**:
  - `custody_summary` (`security_invoker = true`) groups by `wallet_id` and reports `paluwagan_centavos` (sum of confirmed, non-deleted `payments.amount_centavos` on `accepted` cycles where `payout_state is distinct from 'Received'`), `ipon_centavos` (sum of confirmed, non-deleted `savings_contributions.amount_centavos` on `accepted` goals where `withdrawn_at is null`), `total_centavos = paluwagan_centavos + ipon_centavos`, and `holder_active boolean`.
  - Once a cycle is `'Received'` or a savings goal has `withdrawn_at is not null`, its funds leave `custody_summary`.
  - `payments` adds `note text not null default '' check (char_length(note) <= 140)`. Editing only `note` via `edit_payment` preserves confirmation status and writes `history`.

### 10.2 Savings Goals ("Ipon Goals" — `matched` Cadence & `flexible` Shared Pot)

- `savings_goals(id, group_id, title, goal_mode, wallet_id, pending_wallet_id, wallet_proposed_by, target_amount_centavos, step_amount_centavos, cadence_days, num_steps, start_date, end_date, proposed_by, status, accepted_by, accepted_at, withdraw_proposed_by, withdrawn_by, withdrawn_at, created_at)`:
  - `title` is trimmed, 1..60 characters.
  - `goal_mode in ('matched', 'flexible')`.
  - In `matched` mode: `step_amount_centavos between 100 and 1000000000`, `cadence_days between 1 and 90`, `num_steps between 1 and 366`, `end_date = start_date + ((num_steps - 1) * cadence_days)`, and `target_amount_centavos = step_amount_centavos * num_steps * 2` (computed by the RPC).
  - In `flexible` mode: `step_amount_centavos is null`, `cadence_days is null`, `num_steps is null`, `target_amount_centavos between 100 and 10000000000`, and `end_date >= start_date`.
  - Total span `end_date - start_date <= 1095` (max 3 years).
  - **Active goal cap (max 3)**: under the group row lock, `propose_savings_goal` rejects a new proposal if the group already has 3 goals where `(status = 'proposed' and hulog_today() <= start_date) or (status = 'accepted' and withdrawn_at is null)`. Unaccepted proposals with `hulog_today() > start_date` have derived phase `'expired'` and do not count against the cap.
  - **Accept / Decline / Cancel (`respond_savings_goal`)**: proposer can `'cancel'`; the other active member can `'accept'` (only while `hulog_today() <= start_date`) or `'decline'`.
  - **Wallet change (`propose_goal_wallet` / `respond_goal_wallet`)**: allowed while `status = 'accepted' and withdrawn_at is null`. If moving between the current holder's own non-archived wallets by the holder, updates immediately; otherwise sets `pending_wallet_id` and `wallet_proposed_by` for the other active member to accept/decline.
  - **Two-step withdrawal / closing (`propose_withdraw_goal` / `respond_withdraw_goal`)**:
    - Allowed on an `accepted` goal with `withdrawn_at is null`.
    - Blocked while any non-deleted contribution on the goal has `status = 'pending'` or `delete_proposed_by is not null`.
    - While `withdraw_proposed_by is not null`, new contributions and contribution edits/delete proposals are blocked.
    - The other active member (`<> withdraw_proposed_by`) confirms (`withdrawn_at = now(), withdrawn_by = auth.uid()`, clearing `pending_wallet_id` and `wallet_proposed_by`) or declines (`withdraw_proposed_by = null`); proposer can cancel.
- `savings_contributions(id, goal_id, member_id, steps, amount_centavos, note, status, was_confirmed, created_by, last_edited_by, delete_proposed_by, created_at, confirmed_by, confirmed_at, edited_at, deleted_at)`:
  - Recording (`record_savings_contribution`) is allowed while `goal.status = 'accepted' and goal.withdrawn_at is null and goal.withdraw_proposed_by is null` (including during `upcoming` before `start_date` and after `end_date`).
  - Under the goal row lock (`private.lock_goal`):
    - In `matched` mode: `steps >= 1`, `amount_centavos = steps * goal.step_amount_centavos`, and `(sum(steps) of the member's non-deleted contributions) + steps <= goal.num_steps`.
    - In `flexible` mode: `steps is null`, `amount_centavos > 0`, and `(sum(amount_centavos) of all non-deleted contributions on the goal) + amount_centavos <= goal.target_amount_centavos`.
  - Every contribution starts `status = 'pending'`.
  - **Confirm (`confirm_savings_contribution`)**: callable by the active member `<> coalesce(last_edited_by, created_by)` while `goal.withdrawn_at is null`. Sets `status = 'confirmed', was_confirmed = true, confirmed_by = auth.uid(), confirmed_at = now(), delete_proposed_by = null`.
  - **Edit / Delete (`edit_savings_contribution` / `respond_delete_savings_contribution`)**:
    - Editing `steps` or `amount_centavos` (excluding the edited row from the cap) sets `status = 'pending'`, `last_edited_by = auth.uid()`, clears `confirmed_by`, `confirmed_at`, and `delete_proposed_by`, and preserves `created_by` and `was_confirmed`. Editing only `note` preserves confirmation status.
    - Deleting a `pending` contribution soft-deletes immediately (`deleted_at = now(), edited_at = now()`).
    - Deleting a `confirmed` contribution sets `delete_proposed_by = auth.uid()`, requiring the other active member (`<> delete_proposed_by`) to confirm (`deleted_at = now()`) or decline (`delete_proposed_by = null`); proposer can cancel.

### 10.3 Shared Expense & "Abono" Tracker (`abono_entries` + `abono_summary`)

- `abono_entries(id, group_id, kind, from_member, to_member, description, total_amount_centavos, owed_amount_centavos, entry_date, note, status, was_confirmed, created_by, last_edited_by, delete_proposed_by, created_at, confirmed_by, confirmed_at, edited_at, deleted_at)`:
  - `kind in ('expense', 'settlement')` (immutable after creation).
  - `from_member <> to_member`; both must be active members in `group_id`.
  - For `'expense'`: `from_member` paid the merchant `total_amount_centavos > 0`, and `to_member` owes `from_member` `owed_amount_centavos` (`0 < owed_amount_centavos <= total_amount_centavos`).
  - For `'settlement'`: `from_member` (the debtor) paid `to_member` (the creditor) `owed_amount_centavos = total_amount_centavos > 0`.
  - `entry_date <= hulog_today()`.
- **Net Abono Balance (`abono_summary` view, `security_invoker = true`)**:
  - Separate from Paluwagan cycle shortfall debt.
  - For active members $u$ and $v$ in a group:
    $$\text{confirmed\_net}(u \to v) = \sum_{\substack{\text{confirmed expense}\\\text{from}=v, \text{to}=u}} \text{owed} - \sum_{\substack{\text{confirmed expense}\\\text{from}=u, \text{to}=v}} \text{owed} - \sum_{\substack{\text{confirmed settlement}\\\text{from}=u, \text{to}=v}} \text{owed} + \sum_{\substack{\text{confirmed settlement}\\\text{from}=v, \text{to}=u}} \text{owed}$$
  - When `confirmed_net(u -> v) > 0`, $u$ owes $v$ that amount.
- **Settlement Cap & Mutual Confirmation**:
  - Recording or editing a `'settlement'` locks the group row and requires `new_amount + sum(pending non-deleted settlements from from_member to to_member, excluding edited row) <= confirmed_net(from_member -> to_member)`.
  - `confirm_abono_entry(p_id)`: callable only by the active member `<> coalesce(last_edited_by, created_by)`. For a `'settlement'`, re-checks under the group lock that `owed_amount_centavos <= confirmed_net(from_member -> to_member)`.
  - `edit_abono_entry` & `respond_delete_abono_entry`: changing financial fields (`from_member`, `to_member`, `description`, `total_amount_centavos`, `owed_amount_centavos`) resets `status = 'pending'`, sets `last_edited_by = auth.uid()`, clears `confirmed_by`/`confirmed_at`/`delete_proposed_by`, and preserves `created_by` and `was_confirmed`. Editing only `note` or `entry_date` preserves confirmation. Deleting a `pending` row soft-deletes immediately; deleting a `confirmed` row sets `delete_proposed_by = auth.uid()` for two-step partner confirmation.

### 10.4 Navigation & Screens (v2)

- **Top Header**: `hulog.` brand on left; `<NavLink to="/changes">` (`IconBell` with `aria-label` and numeric unread count badge) + `Sign out` on right.
- **4-Tab Bottom Nav**: `Home` (`/`), `Tracker` (`/tracker`), `History` (`/history`), `Group` (`/settings`).
- **Home**: Custody Breakdown Card (`custody_summary`), unified "Waiting for your check" confirm list, Paluwagan Round section, and Ipon Goals section (up to 3 active goals).
- **Tracker**: Net Abono balance card with **Settle Abono** action + Shared Expense & Settlement log + `+ Add Abono`.
- **History**: Closed Paluwagan cycles (with cycle debts/repayments) + completed/withdrawn/expired Ipon goals.
- **Settings**: Profile (`Ikaw`), Group name, Wallets Manager, Invite QR, Theme (`Itsura`), Language (`Wika`), Notifications, Updates, and extended CSV export (`cycles`, `payments`, `repayments`, `wallets`, `savings-goals`, `savings-contributions`, `abono-entries`).

### 10.5 Personal savings (owner decisions, 2026-10-21)

- Each active member can keep personal savings goals inside their group. Goals sync through Supabase when signed in. This ledger is separate from mutually confirmed shared ipon and shared wallet/custody totals: personal money must never be disclosed through a group-wide balance or audit feed.
- A personal goal has `owner_id`, `group_id`, a trimmed 1–60 character title, a positive integer-centavo target, and visibility `private` (default) or `shared`. The owner can change visibility at any time. Targets are milestones; deposits can exceed the target.
- Only the owner may create, update or soft-delete their personal goals and entries. Group and owner come from the active membership and `auth.uid()`, never client-supplied identity. A partner in the same active group may read a non-deleted shared goal and its non-deleted entries, with no write or confirmation powers. Private goals, entries, and all audit snapshots are owner-only. Switching shared to private revokes partner reads immediately at the database. Anonymous users and non-members cannot read these rows or call the write RPCs.
- A personal entry is a deposit or withdrawal, with a positive integer-centavo amount, an entry date no later than `hulog_today()` (Asia/Manila), and an optional note up to 140 characters. Kind is immutable; amount/date/note can be corrected. Goal writes lock the goal row; entry creation, correction and soft deletion take the same goal lock before validating the resulting balance. Balances stay between zero and 10,000,000,000 centavos; amounts and targets are between 1 and 10,000,000,000 centavos. A correction/deletion that would make the current balance negative is refused.
- `personal_savings_goals`, `personal_savings_entries`, and `personal_savings_history` all have RLS. Authenticated clients receive SELECT only and write through the explicitly granted security-definer RPCs `create_personal_goal`, `update_personal_goal`, `record_personal_entry`, and `update_personal_entry`. Each RPC pins its search path. Private helpers are not executable by API roles.
- Goal and entry changes retain owner-only audit snapshots in `personal_savings_history`. Deletion sets `deleted_at`; it never deletes financial rows or audit history. Deleted goals remain readable by their owner for history, are hidden from partners, and reject further writes. Shared savings approval, repayment, payment and cycle lock rules are unchanged.
- Home shows **Sariling ipon** under the shared round, with creation, deposit/withdrawal recording, owner history, and word labels alongside lock/eye icons. Partner-shared goals show the owner's name and read-only details. The existing ipon proposal form is for shared goals; personal goals use the Home section. Existing hosted `[Solo]` shared-ipon records keep their original mutual-confirmation contract; they are not silently reclassified.
- Offline solo mode uses the same personal-goal UI and owner ledger on the device, clearly labelled as local-only. Existing local `[Solo]` goals migrate once, preserving IDs, notes, balances and prior shared visibility. New goals default private. Switching offline preview modes preserves personal records. Offline preview data is not automatically uploaded or merged into an online account.
- Hulog records movements the user already made; recording a deposit or withdrawal never moves money.


### 10.6 Monthly recap (owner decisions, 2026-10-22)

- **Month**: a calendar month in Asia/Manila. The default is the current Manila month (`hulog_today()`). Previous/next arrows move one month; the picker cannot go later than the current month, and the earliest month is the month of the group's earliest record (or the current month when there is none).
- **Read-only and client-side**: the recap is derived from data the viewer can already read under RLS. It adds no table, view or RPC, and works in offline solo mode.
- **Confirmed only**: only confirmed, non-deleted records count. Pending records are shown only as a count ("N pa pending") and are never added to totals.
- **Paluwagan**: payments are dated by the Manila date of `confirmed_at`, falling back to `created_at` (the same Manila date convention the cycle screen uses for a payment); show the total and the per-member split. Payouts are cycles whose `received_at` Manila date falls in the month, each valued at that cycle's pot with its receiver.
- **Abono**: expenses by `entry_date` (total spent and how much each member paid) and settlements by `entry_date` (total settled).
- **Shared ipon**: confirmed contributions dated like payments (Manila date of `confirmed_at`, fallback `created_at`): total and per goal.
- **Personal savings**: shown only to the viewer, for the viewer's own goals plus a partner's goals with `visibility = 'shared'`. Net = deposits − withdrawals by `entry_date`. A partner's private goals never appear: RLS already blocks them, and the client also filters by owner and visibility.
- **Share card**: a PNG drawn on a canvas with the month, the group name and GROUP figures only (paluwagan paid and payouts, abono spent and settled, shared ipon saved). Personal savings are never on the card. It is shared with the Web Share API as a file when `navigator.canShare({ files })` is true, otherwise downloaded. Nothing is uploaded.
- Amounts are integer centavos throughout and are shown with the existing peso formatter. Hulog records movements the user already made; the recap never moves money.

### 10.7 Savings growth charts (owner decisions, 2026-10-23)

- **Read-only and client-side**: charts are derived from data the viewer can already read under RLS. They add no table, view or RPC, and work in offline solo mode.
- **Shared ipon goal page**: plots cumulative confirmed, non-deleted contributions over time as a step line, dated by the Manila date of `confirmed_at` (falling back to `created_at`, the recap convention), starting from the goal's `start_date` at zero. The goal's target is a dashed reference line. Pending contributions are not plotted.
- **Personal goals**: a chart appears only for goals the viewer can see: the viewer's own goals, and a partner's goal only while `visibility = 'shared'`. The client filters by owner and visibility as well as relying on RLS; a partner's private goal yields no series. The balance is cumulative deposits minus withdrawals by `entry_date`, non-deleted entries only, with no floor applied, so the chart shows the real recorded balance.
- **Chart**: hand-rolled SVG with no charting dependency, responsive down to 360px. It shows the first and last date, the current amount, and an accessible text summary ("₱X of ₱Y saved since <date>"). The y-axis spans from the lower of zero and the lowest balance up to the higher of the target and the peak. It is hidden when there are fewer than 2 data points, and it never animates.
- Amounts are integer centavos throughout. Hulog records movements the user already made; a chart never moves money.

### 10.8 Streaks and goal celebration (owner decisions, 2026-10-23)

- **Read-only and client-side**: streaks and celebrations are derived from data the viewer can already read under RLS. They add no table, view, RPC or notification, and work in offline solo mode. Amounts stay integer centavos; Hulog records movements the user already made and never moves money.
- **Paluwagan streak**: for an active member, the number of consecutive most-recent **ended** cycles (phase `ended`, ordered by `end_date` descending, then `created_at`) that the member finished clean. Counting starts at the latest ended cycle the member took part in and stops at the first cycle that was not clean.
  - **Clean** = the member's `member_progress` row for that cycle has `debt_centavos = 0` (the §3 derived debt, repayments included) **and** `confirmed_days >= num_days` (every day paid and confirmed). So a receiver who left days unpaid, or a debtor who only cleared the debt later through repayment, did not finish a full round.
  - A cycle with debt, or with days short, breaks the streak. Cycles the member took part in without a clean finish are never skipped.
  - **Skipped, never breaking**: ended cycles the member was not part of, meaning there is no `member_progress` row for the member, or the cycle is a solo round (`is_solo`) saved by someone else (the observer's row there carries no real obligation).
  - Open, upcoming, settling, proposed and declined cycles are ignored. Being behind in the open round neither adds to nor breaks the streak, and no "on track" flag is shown.
- **Streak chip**: on the current round's member list on Home, a small chip `🔥 N rounds na buo` appears next to a member's name only when the streak is 2 or more. It is informational: no notification, no nag, no chip for solo-round observers.
- **Goal celebration**: the first time a viewer sees a goal reached on a device, show a confetti burst and the line `Naabot na! 🎉` once.
  - **Shared ipon goal** reached = accepted, not withdrawn, `target_amount_centavos > 0` and confirmed `saved_centavos >= target_amount_centavos`. Pending contributions never count.
  - **Personal goal** reached = the viewer owns the goal, it is not deleted, and the owner's balance (§10.5) is at least the target. A partner's personal goal, shared or private, never celebrates for the viewer.
  - **Memory**: per goal per device in `localStorage` under `hulog-goal-celebrated:<id>` (`ipon-<goal id>` or `personal-<goal id>`), plus session memory, so blocked storage still cannot repeat it within a session. Every storage access is try/catch.
  - **Already reached before this shipped**: no seeding. A goal that is already reached celebrates once on first view. Ipon goals that the earlier payout-style burst already celebrated (ids `ipon-<id>` in `hulog-confetti-seen`) are treated as seen, so those do not repeat.
  - **Reduced motion** (`prefers-reduced-motion: reduce`): no confetti. Only the `Naabot na! 🎉` text badge shows, once.
  - Shown wherever the goal card renders (Home, ipon goal page, personal goal card); the burst is non-blocking and ignores pointer events.

### 10.9 Round calendar (owner decisions, 2026-10-23)

- **Read-only and client-side**: the calendar is derived from `cycle_summary` and `member_progress` rows the viewer can already read under RLS. It adds no table, view, RPC or notification, and works in offline solo mode. Dates are Asia/Manila calendar dates and "today" is `data.today` (`hulog_today()`), never the client clock. Hulog records movements the user already made; the calendar never moves money.
- **Where**: a single collapsible block ("Round calendar") on the cycle detail screen, between the round card and the payments list. It is shown for `accepted` cycles in phase `open` or `settling` (open by default) and `ended` (collapsed, as a record). It is not shown for `upcoming`, `proposed`, `declined` or `cancelled` cycles, or when the round has no days to show.
- **Whose calendar**: one calendar per member who owes days in the round. Both active members owe `num_days` (§4 rule 5), **including the receiver**: the receiver also pays in (the receiver's shortfall only creates no _debt_, §3). In a solo round (`is_solo`) only the saver (`receiver_id`) owes days; the observer has no calendar. With two members a two-chip toggle (first names) picks the calendar, defaulting to the viewer; with one member there is no toggle.
- **Filled in order, not per date**: payments record a **number of days**, not specific dates (§3). The calendar therefore does **not** track which date was paid. For one member it takes the derived `confirmed_days` and `pending_days` from `member_progress` (confirmed and pending, non-deleted payments) and fills the round's days in order from `start_date`:
  1. the first `confirmed_days` days are **Paid**;
  2. the next `pending_days` days are **Pending** (waiting for the other member to confirm);
  3. every remaining day **before** `data.today` is **Kulang** (missed);
  4. every remaining day on or after `data.today` is **Darating** (upcoming).
  Counts are clamped to the days shown, and a member without a `member_progress` row falls back to summing their non-deleted payments by status. Because of the days cap (§4 rule 5) paid + pending never exceeds `num_days`. Paying ahead therefore marks later days Paid; a late payment fills the earliest Kulang days first. The block says in one line that days fill in order.
- **Today is not yet missed**: a day equal to `data.today` is still payable (§4 rule 5), so an unpaid today is **Darating**, shown with an outline marking today. After the round is closed (`settling`/`ended`) today is past `end_date`, so every unpaid day is Kulang, which matches the §3 debt rule.
- **Days shown**: `start_date` through the stored `end_date`, one cell per day. After an early close (§4 rule 8a) `end_date` was moved earlier, so days after the actual `end_date` are not shown and only the paid days that fit within the shortened round are counted. Pending days are shown as Pending even after the confirm window has passed; the payments list keeps the "Unconfirmed — not counted" wording (§4 rule 6).
- **Grid**: 7 columns, **Sunday first** (the repo has no other week convention). Days run continuously across month boundaries; the grid is padded with empty cells before the first and after the last day, and the first shown day of each month carries a small month label. Each cell shows the day number and a state mark (icon, not colour alone): a check for Paid, a clock for Pending, a cross for Kulang, a dot for Darating. Today has a heavy outline. Each cell has an `aria-label` such as "Oct 21: Paid" (with ", today" added for today).
- **Legend**: one compact line of counts, "Paid 8 · Pending 1 · Kulang 2 · Darating 4", counting only the days shown. It uses the same marks as the cells.
- Must work at 360px with no horizontal scroll, in light and dark. Integer days only; no animation.

### 10.10 Wishlist "Gusto natin" (owner decisions, 2026-10-23)

- **What**: one shared list per group of things the two members want to buy. It is a record only: "Nabili na" notes that someone bought the item on their own, outside Hulog. Hulog never holds, transfers or pays money, and marking an item bought never moves any.
- **Table `wishlist_items`**: `id uuid pk`, `group_id` (fk `groups`), `title` text (trimmed, 1–60 characters), `price_centavos` bigint (integer centavos, 1 to 10,000,000,000), `note` text null (at most 140 characters; blank is stored as null), `linked_goal_id` uuid null (fk `savings_goals`, same group), `added_by` (fk `profiles`), `status` `'wanted'|'bought'` (default `'wanted'`), `bought_by` null, `bought_at` timestamptz null, `created_at`, `updated_at`, `deleted_at`. `status = 'bought'` if and only if `bought_by` and `bought_at` are set. At most 30 non-deleted items per group, enforced while holding a lock on the group row so two members cannot both add the 31st.
- **Visibility**: a shared list. Both active members of the group read every non-deleted item of their group (RLS select). Nothing else is readable. Authenticated clients get SELECT only, with no insert, update or delete policies or grants; anonymous users and non-members read nothing.
- **RPCs** (`security definer`, `set search_path = public, pg_temp`, `revoke ... from public, anon`, `grant execute ... to authenticated`; actor is `auth.uid()`; group is the caller's active group; a caller without an active membership is refused with "Active membership required"):
  - `add_wishlist_item(p_title, p_price_centavos, p_note, p_linked_goal_id)` returns the new id; `added_by` is `auth.uid()`.
  - `edit_wishlist_item(p_id, p_title, p_price_centavos, p_note, p_linked_goal_id)` replaces all four fields (a null note clears it, a null goal unlinks). Either member may edit, only while `status = 'wanted'`.
  - `set_wishlist_bought(p_id, p_bought boolean)`: either member. `true` sets `status = 'bought'`, `bought_by = auth.uid()`, `bought_at = now()`; `false` returns it to `'wanted'` and clears both. Setting the state it already has changes nothing, so the original buyer is kept.
  - `delete_wishlist_item(p_id)`: either member; soft delete (`deleted_at`), also allowed for bought items. A deleted item cannot be changed again.
  - A linked goal must be a shared ipon goal of the same group that is `proposed` or `accepted` and not withdrawn; otherwise the RPC fails. Personal savings goals cannot be linked, so private money stays private.
- **History**: item rows use the same group audit trigger (`private.audit()`) as the abono and ipon tables, so adds, edits, bought toggles and deletes appear in the group's Changes feed with before/after snapshots. This is appropriate because the list is shared by both members by design. Rows are never hard-deleted.
- **Linked goal display**: an item with a linked goal shows that goal's progress: its confirmed `saved_centavos` against this item's price, as "₱X of ₱Y". When saved is at least the price it reads "kaya na!". Pending contributions never count. If the goal is later withdrawn or no longer visible, the link stays stored but no progress is shown.
- **Screens**: Home gets one compact card ("Gusto natin", with the open-item count) linking to `/wishlist`. The wishlist screen lists wanted items first (oldest first) then bought items, each with price, note, linked-goal progress, who added it, a "Nabili na" toggle, edit and delete (with a simple confirm). The add/edit form has title, price, note and an optional shared ipon goal select. Works at 360px, in light and dark, and in all three languages.
- **Offline solo mode** implements the same four RPCs and the same validation on the device, labelled local-only like the other solo records. The app reads `wishlist_items` with the optional-relation loader so it works before the migration is live.

### 10.11 Offline recording (owner decisions, 2026-10-23)

- **What**: a paluwagan hulog, an abono expense or an abono settlement entered without a connection waits on the device and is written to the server when the connection returns. A waiting entry is only a record that has not been written yet: it is not a payment, it moves no money, and Hulog still never holds or transfers any.
- **Why the server is involved**: a retry after a lost response (the request reached Postgres, the reply did not reach the phone) would otherwise record the payment twice. Exactly-once therefore needs an idempotency key on the write RPCs, not only a client queue.
- **Schema**: `payments.client_request_id uuid null` and `abono_entries.client_request_id uuid null`, each with a unique partial index on `(created_by, client_request_id) where client_request_id is not null`. The key is scoped to the caller, so two users can never collide. The index includes soft-deleted rows, so a deleted record stays the answer to its own key and a late retry cannot bring it back. Rows without a key (older rows, and calls that omit it) are never deduplicated.
- **RPCs** (`security definer`, `set search_path = public, pg_temp`, `revoke ... from public, anon`, `grant execute ... to authenticated`; the actor is `auth.uid()`):
  - `record_payment(p_cycle_id, p_days, p_note, p_client_request_id default null)` replaces the 3-argument form, which is dropped so no stale overload stays executable. The 2-argument form from v2 stays and reaches the new function with no key.
  - `record_abono_entry(p_kind, p_from_member, p_to_member, p_description, p_total_amount_centavos, p_owed_amount_centavos, p_entry_date, p_note, p_client_request_id)` is a new 9-argument form with no defaults. The 8-argument form stays as a thin wrapper (same defaults, no key). Keeping both without defaults on the new one means a request never matches two overloads. Over the API a keyed `record_payment` call must send `p_note` and a keyed `record_abono_entry` call must send all nine arguments.
  - Inside the existing lock (cycle row for payments, group row for abono), before any other check: if the caller already has a row with that key, return its id and write nothing. A key already used for another cycle (or group) raises `Request id already used`. Otherwise every existing rule runs unchanged for a first insert, and the insert is guarded so that a unique violation on the key returns the existing row instead of failing.
  - The replay check comes first on purpose: the replay of a request that already landed must still return it after the cap is full, after the window has closed, or when a settlement now counts itself as pending. A new key is always judged fresh.
- **Rules are judged at sync time**: the payment window (§4 rule 5), the day cap, membership, the settlement cap and the future-date check are all evaluated by the server when the request runs, against `hulog_today()`. A queued entry that no longer fits (the round closed, the day cap filled) is rejected then and shown as failed; nothing is bent to make it fit. The abono `entry_date` is the date the user saw (`data.today`, itself from `hulog_today()`) when the entry was made.
- **Outbox** (client only, `localStorage`, every access try/catch): items `{id, kind: 'payment' | 'abono', args, createdAt, state: 'queued' | 'sending' | 'failed', error?}` stored per signed-in user id.
  - The item `id` is the `client_request_id`. It is generated once when the entry is first sent or queued and is reused unchanged on every retry. Online submits send a key too, so a double-tap dedupes.
  - Enqueue happens only when the browser reports offline (`navigator.onLine === false`) or the call fails with a network error. A rule error from the server is shown as an error and is never queued.
  - Flush on `online`, window focus and app load: sequential, one flush at a time (`navigator.locks` when available, otherwise an in-memory flag). Success removes the item and reloads data. A rule error marks the item `failed` with the server's message, keeps it for "Try again" (same key, so it cannot record twice) or Discard and is never retried automatically. A network error, a temporary server error (connection, timeout, deadlock) or an invalid session leaves it queued. Before each send the live session user must equal the queue owner, otherwise the flush stops.
  - A queue belongs to one user id; a different signed-in user never sends it. Solo mode has no outbox: `src/solo.ts` accepts and ignores the key and everything is local already.
- **UI**: while offline the Record and abono buttons read "I-save muna (offline)" and the confirmation says it will sync. Home shows one compact strip "N hindi pa naka-sync" with "Sync now" and, for each failed item, its reason, Try again and Discard. Waiting entries are never part of the pot, debt, tallies or totals until the server has written them and the partner has confirmed them as usual.
- **Out of scope**: offline edits, confirms, deletes, ipon contributions and personal savings. No Background Sync API (not available on iOS).
- **Owner phone check**: airplane mode, record a hulog, see it marked unsynced, go back online, and it appears once on both phones and can be confirmed.

### 10.12 Year in review (owner decisions, 2026-10-23)

- **What**: the recap screen (§10.6) gets a Month / Year toggle. Year mode shows one Manila calendar year (January to December, Asia/Manila) with the same figures and rules as a month. It is read-only, client-side, adds no table, view or RPC, and works in offline solo mode.
- **One set of rules**: the year is built by adding up the twelve month recaps from the same `buildRecap`, so the rules are not written twice: confirmed and non-deleted records only, paluwagan and ipon dated by the Manila date of `confirmed_at` (fallback `created_at`), payouts by the Manila date of `received_at`, abono by `entry_date`, and pending records only as a count ("N pa pending"), summed over the year. A record confirmed at 2026-12-31T16:30Z is 2027-01-01 in Manila and belongs to 2027.
- **Personal savings**: shown only to the viewer, for the viewer's own goals plus a partner's goals with `visibility = 'shared'`, with the year's net per goal. A partner's private goals never appear.
- **Picker**: previous/next year arrows; switching to Year starts at the year of the month on screen. The earliest year is the year of the group's earliest record (or the current year when there is none); the picker cannot go past the current Manila year.
- **Per-month bars**: a compact list of hand-rolled bars (no chart library), one row per month from the earliest month with records up to the current month. Each bar is the group total moved that month: paluwagan paid in + abono spent + shared ipon saved. Payouts and settlements are not added, because a payout hands back money already counted as paid in and a settlement pays back an expense already counted as spent. A bar is scaled to the busiest month and is at least 3% wide when the month is not empty. A "best month" line names the month with the highest total (the earliest wins a tie) and is omitted when nothing moved.
- **Share card**: the same card with the year ("2026") as its title, GROUP figures only (paluwagan paid and payouts, abono spent and settled, shared ipon saved). Personal savings and the per-month list are never on the card. The file is named `hulog-recap-2026.png`.
- Amounts are integer centavos and use the existing peso formatter. Works at 360px, in light and dark, and in all three languages. Hulog records movements the user already made; the recap never moves money.
- **Owner phone check**: open Recap, tap "Taon", step back a year, see the bars and the best month, share the card and confirm it shows no personal savings.


### 10.13 Recurring bills suggestions (owner decisions, 2026-10-23)

- **What**: on the Gastos (abono) screen, above "Add shared expense", Hulog offers up to three bills that keep coming back, one compact row each: "Kuryente ~₱2,450 — i-record?". It is client-only: no table, RPC or migration, and it works in offline solo mode. It only suggests; it never records anything.
- **A suggestion** is a bill seen on a confirmed, non-deleted `expense` (settlements are ignored) with the same normalized description (trimmed, case-folded, runs of whitespace collapsed) and the same payer (`from_member`), dated in at least two different months among the three whole Manila months before the current one (for example July, August and September when today is in October). The current month is never part of that window. Pending and deleted entries are not past sightings.
- **Not yet recorded**: a bill is hidden while the current Manila month already has a non-deleted expense with the same payer and description, pending ones included (so the row does not return right after the user records it and before the partner confirms). A deleted entry does not hide it.
- **Amount**: the median of the totals of the matching past entries in integer centavos (an even count averages the middle two, rounded half up). The partner's share is pre-filled in the same proportion as the most recent matching entry, rounded half up to the centavo and kept between 1 centavo and the total.
- **Tapping a row** opens the existing add form pre-filled with description (the newest spelling), total, payer and the partner's share, dated today. The user still taps "Record expense"; nothing is recorded automatically and the usual server rules apply.
- **Order**: bills seen in more months first, then the most recently seen, then by key; at most three rows. Only bills paid by one of the two members are offered, filtered before the cut to three. Opening a suggestion gives the form a fresh request key (§10.11). Rows are hidden while the add form is open.
- **"Huwag na"** hides that suggestion until the end of the month. It is stored on this device only (`localStorage`, every access in try/catch) per signed-in user as `{month, keys}`; a new month starts empty, and if storage fails the row still hides for this session.
- Known limit: a bill recorded this month but dated in an earlier month does not count as recorded this month, so it stays suggested until the user taps "Huwag na".
- Works at 360px (the row wraps, the skip button stays tappable), in light and dark, and in all three languages.
- **Owner phone check**: with an expense recorded and confirmed in two earlier months, open Gastos, see the suggestion, tap it, check the pre-filled form, record it and see the row disappear; on another suggestion tap "Huwag na".

### 10.14 Payment proof reference (owner decisions, 2026-10-23)

- **What**: an optional e-wallet reference number (GCash or Maya "ref no.") on a paluwagan payment and on an abono entry (expense or settlement), so the partner can match it against their own wallet when confirming. Hulog still only records money: the reference is text, nothing is verified or moved.
- **Data**: `proof_ref text null` on `payments` and `abono_entries`, with a check that it is trimmed, 4 to 40 characters, and only letters, digits, spaces and dashes (`[A-Za-z0-9 -]`). Account numbers, PINs and passwords are not what this field is for, and the form says so: "Ref no. lang — huwag ilagay ang account number o PIN".
- **Record**: `record_payment` and `record_abono_entry` gain an optional `p_proof_ref`. Migration `20261023000300_payment_proof_ref.sql` adds the new signatures (`record_payment(uuid, integer, text, uuid, text)` and the 10-argument `record_abono_entry`) as overloads without defaults, so PostgREST, which picks an overload from the argument names, never sees two matches, and keeps the existing 4-argument and 9-argument forms (and the 8-argument abono form) as thin wrappers that pass no reference. A blank reference is stored as null; an invalid one raises "Reference must be 4 to 40 letters, numbers, spaces or dashes" and writes nothing. A replayed request key returns the original row and never changes its reference (§10.11).
- **Edit**: `edit_payment` and `edit_abono_entry` gain `p_proof_ref` the same way. `null` leaves the reference alone and an empty string clears it. A change is allowed only for the creator and only while the entry is `pending`; anyone else, or a confirmed entry, raises "Reference can only be changed by its creator while pending". Sending the unchanged value is always fine. Changing only the reference is not a money change, so it does not reset the partner's confirmation or add a pending step. All other edit rules are unchanged.
- **Who sees it**: the existing RLS and table grants. The reference is a column of rows members of the group already read; outsiders and anon read nothing. It is shown as "Ref …" under the entry on Home (waiting for your check), the round's payment list and the Gastos entry list, so the partner sees it when confirming.
- **UI**: one optional "Ref no." field under the note on Record, the Gastos add form and the settlement form, and in the edit forms only for the creator while pending. The note field keeps its meaning; its label no longer asks for a ref #. Works at 360px, in light and dark, and in all three languages.
- **Offline and solo**: the outbox sends `p_proof_ref` only when there is a reference (blank is left out) and keeps it on queued records. Edits that carry a reference send every argument of the new overload, with `null` meaning "leave as is". `src/solo.ts` mirrors the validation and the creator-while-pending rule; solo records are confirmed immediately, so their reference is fixed at creation.
- **Not in scope**: showing references in the history diff screen or in exports; verifying a reference against GCash or Maya.
- **Owner phone check**: on one phone record a hulog with a ref no.; on the other phone open Home, see "Ref …" under the waiting hulog and confirm it. Record an expense with a ref, edit the ref while pending, and check that it can no longer be edited after the partner confirms.
