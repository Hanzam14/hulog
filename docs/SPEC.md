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
- `cycles(id, group_id, daily_amount_centavos > 0, num_days 1..366, start_date, end_date (stored, set by RPC = start_date + num_days − 1), receiver_id, proposed_by, status: proposed|declined|cancelled|accepted, accepted_by, accepted_at, received_at, created_at)`.
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

**Migration transition (2026-10-07)**: existing confirmed, non-deleted owner payments in accepted cycles with today ≤ end_date + 1 reset to pending, keep `was_confirmed = true`, and clear confirmation metadata. The payment audit trigger writes before/after history with null actor (system entry supported by the schema). Older cycles, partner payments, deleted payments, and unaccepted cycles stay unchanged.

Also test: invite reuse fails; expired and revoked invites fail; concurrent claims → exactly one succeeds; third member can't be accepted; denied/pending user can't read group data; non-member can't call RPCs on another group's ids; second live cycle can't be proposed; days over num_days rejected (including via edit); accept after start_date rejected; editing an originally-pending payment after the settling day does not make it confirmable.

## 8. Acceptance / verification

- `npm run build`, `npm run lint`, `npm test` pass.
- SQL rules tested against local Supabase (`npx supabase start`; Docker is installed) using pgTAP (`supabase test db`) or a Vitest integration suite calling RPCs as two different test users. For tests, `hulog_today()` is overridden only inside the disposable test database (e.g. the test setup replaces the function); production code has no test-clock flag.
- Manual smoke (in SETUP.md): sign in, create group, invite via QR, accept, propose/accept cycle, pay, confirm, export CSV.

## 9. Deliverables

- Repo at `C:\Projects\Hulog`: `README.md` (what it is, MIT), `LICENSE` (MIT), `SETUP.md` (create Supabase project, enable Google provider + redirect URLs, run migrations, env vars, deploy to Vercel, VAPID keys for v1.1, iOS home-screen note), `AGENTS.md` (startup, commands, rules summary pointing to this spec), `.env.example`, `supabase/` migrations + tests, `src/`.
- Local git repo with commits; no remote.
