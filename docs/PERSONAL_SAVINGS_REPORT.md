# Hulog round 2 — 2026-10-21

Status: implementation and local checks ready for independent Claude Opus review. Hosted migration, real Google sign-in, two-device sync and deployment have not been performed.

## Base and merge

- Fetched origin and merged `origin/antigravity/solo-mode` tip `4706a11` via merge commit `e255d6d`. Origin had advanced beyond the single commit mentioned in the brief; it also contained several merged UI improvements.
- Resolved conflicts in Propose, ProposeIpon and style.css with incoming hosted contracts and the round-1 ube styling. Loading placeholders remain, with flat ube surfaces rather than gradient washes.
- Baseline lint and build passed. The first integrated baseline test run reported 117/119 passing: two incoming checks conflicted with existing CSS declaration placement and dot-free translated copy. Reconciled the original 44px selectors and exact translated expectation; the focused v2 suite then passed 24/24. The final full suite below includes these checks.

## Solo bug and regression evidence

The configured Supabase path starts an asynchronous `getSession()` read. The auth subscription can reveal the landing page before that read finishes. Clicking solo sets a local session, but the old read previously assigned its `null` result unconditionally and returned the screen to landing. A second case showed that the same stale read could also replace a newer online session after leaving solo.

App now ignores startup auth reads after a more recent auth event or while solo mode is active. The listener stays registered when starting in saved solo mode. Reload callbacks discard responses from the other data mode.

`src/App.solo.test.ts` stubs environment values and Supabase, without reading `.env` or adding a DOM dependency. It exercises the real App handlers and effects:

- `keeps solo open when a delayed initial auth session resolves`: failed on the integrated baseline after the delayed null response; passes with the fix.
- `does not replace a later online session with the stale startup read after leaving solo`: failed against the first, narrower fix; passes with auth-event ordering.
- `can leave solo and accept a later Google session`.
- `keeps auth listening when the app starts with saved solo mode`.

Evidence is in ignored `.scratch/solo-baseline.log`, `solo-reentry-baseline.log`, and `solo-after.log`; the final full test log also contains the four passing cases. Browser smoke with configured placeholder values opened the personal-savings Home after leaving and re-entering solo. Real OAuth was not attempted.

## Model and behavior

One new migration: `supabase/migrations/20261021000100_personal_savings.sql`.

The existing shared-ipon model requires partner approval, mutually confirmed contributions, custody wallets and two-person closing. Extending it would require changing those write contracts and its group-readable audit feed. Dedicated `personal_savings_goals`, `personal_savings_entries` and owner-only `personal_savings_history` keep the new owner-controlled ledger separate and keep private amounts out of shared custody totals/history.

New goals default private. Only their owner can create/edit/soft-delete goals and deposits/withdrawals. A same-group partner can read shared goals and their live entries, with no writes. Changing back to private removes database read access for the partner. API roles get SELECT only; four explicitly granted security-definer RPCs derive group/owner from active membership and auth.uid(). The private helpers are not granted to clients. All three tables have RLS. Audit records retain before/after snapshots outside the group history feed.

Amounts are integer centavos, bounded to the existing ipon target ceiling of 10,000,000,000 centavos. A goal is a milestone, so deposits can exceed its target. The current balance stays between zero and that ceiling. Entry changes serialize on the goal row, including correction and deletion; changes that would make the balance negative are refused. Entry kind is immutable. Dates use Manila today and reject future dates. Notes are limited to 140 characters. Goal deletion may retain a nonzero recorded balance because Hulog never holds money; the records remain available to owner history.

Home now has Sariling ipon with lock/eye icons and word labels, owner recording/editing controls, partner names/read-only cards, and owner audit history. This reuses the ube card/progress/forms styling rather than coercing the two-person IponCard data type into an owner ledger.

The shared-ipon proposal form points personal saving to the Home section. The standalone local form uses the same personal component. Old local `[Solo]` goals migrate once with the same IDs, notes, balances and prior shared visibility; new goals default private. Offline mode changes preserve personal records. Existing hosted `[Solo]` shared-ipon records keep their old contract rather than being silently reclassified. Offline preview data remains device-local and is not silently uploaded when signing in.

## Checks

| Check | Result |
|---|---|
| `npm run lint` | Pass, exit 0 |
| `npm test` | 132 passed across 15 files, exit 0 |
| `npm run build` | Pass, exit 0; existing inlineDynamicImports deprecation warning |
| Focused auth regressions | 4 passed |
| Local pgTAP full suite | 357 assertions across 6 files, Result: PASS |
| New personal-savings pgTAP cases | 60 assertions included in that total |
| `git diff --check` | Pass before handoff |

The SQL suite ran on a newly named disposable local project `hulog-cute-personal-disposable`, with separate 553xx ports and staged config/migrations/tests under `.scratch/personal-db`. It did not reuse or reset the normal project's local database. The CLI reported that this isolated setup was stopped afterward, with its local backup retained.

The first SQL run passed the existing suites and 56/59 new assertions. Three tests expected a membership-specific error while the scoped lock correctly returned the generic owner-only denial; exact expectations were aligned with that contract. Added explicit coverage that the group creator cannot read the other member's private goal. No authorization assertion was removed.

The pgTAP matrix covers owner create/read/correct/soft-delete, partner private denial, partner shared reads and denied writes, shared-to-private revocation, group-creator privacy, non-member denial, anonymous denial, direct-table write denial, retained owner audit, soft deletion, future dates, invalid visibility, and overdraw/correction/deletion balance checks. Concurrent multi-connection withdrawals were not stress-tested; the locking decision remains an explicit review item.

Browser smoke in local preview created Camera privately, recorded ₱1,000, recorded a ₱200 withdrawal, and corrected the deposit to ₱1,200, showing a ₱1,000 balance. These are synthetic local records, not online account data.

At 360px, final measured private/shared dark cards and light/dark creation forms had no horizontal overflow or visible target below 44px. An initial 22.5px history summary was corrected to 44px. Expanded entries and correction forms were also inspected; the raw measurement JSON retains the before/final samples. This covers the observed states, not every possible input or device.

## Screenshots

CSS viewport was requested and observed at 375×812. The browser screenshot service exports a scaled 360×780 JPEG; the PNGs preserve that native capture size without upscaling. Full-page capture timed out, so these are viewport captures of the personal section. The originals and measurements remain excluded under design-shots/.

| State | Light | Dark |
|---|---|---|
| Private | [PNG](../design-shots/round2-personal-private-light.png) | [PNG](../design-shots/round2-personal-private-dark.png) |
| Shared | [PNG](../design-shots/round2-personal-shared-light.png) | [PNG](../design-shots/round2-personal-shared-dark.png) |

Responsive samples: `design-shots/round2-qa-360.json`. The partner read-only rendering is covered by the SSR component test and database role tests; screenshots show the owner's visibility states.

## Owner apply steps — after Claude review

1. Have Claude Opus review the current source and Claims packet at high effort for security/money, following `C:/Users/Hoybos/.agents/bin/review-rubric.md`. Resolve findings and record the independent verdict before hosted apply. The builder has not attested a PASS.
2. In the owner-operated checkout containing the reviewed migration, use the existing Supabase login/link for the intended project. Verify the linked project identity; do not create or switch projects casually. Keep credentials outside Git/chat.
3. Run `npx supabase migration list --linked`, then `npx supabase db push --linked --dry-run`. The dry run must list exactly `20261021000100_personal_savings.sql` as pending for this feature. If other migrations are pending, stop and review them separately; do not use `--include-all` blindly.
4. The owner runs `npx supabase db push --linked` only after that review and target check. This is the hosted write; the worker has not run it. Apply the migration before rolling out the frontend that exposes these controls.
5. On two signed-in devices, create a private personal goal as each member. Verify the other cannot see it. Share one, verify its entries are visible without write controls, then make it private and reload the partner device to verify removal. Record/correct/delete synthetic entries, inspect the owner's audit, and confirm the other member cannot write through RPCs. Separately smoke-test leaving solo and real Google sign-in. Phone/cloud checks remain incomplete until the owner performs them.

## Changed files and review items

Feature sources: App.tsx; data.ts; solo.ts; new personal.ts and components/PersonalSavings.tsx; Home.tsx; ProposeIpon.tsx; style.css; i18n.ts; docs/SPEC.md. Tests: new App.solo.test.ts and personal.test.ts, personal_savings.test.sql; updates to data.test.ts, proposals.test.ts and components/v2.test.ts for the unified model. One new SQL migration. The report, Claims packet and continuity records provide handoff evidence.

Decisions for review: dedicated ledger and owner-only audit; no reuse of shared three-goal cap; current-balance validation rather than a historical daily-balance constraint; positive capped centavos with deposits beyond target; same goal-row lock for all entry mutations; private default and arbitrary-time visibility changes; soft deletion with owner history; local legacy sharing preserved; no silent migration of hosted legacy shared goals or automatic offline upload; shared form now points personal saving to Home.

There is no blocking product question. The owner/lead should rule on those decisions and whether a later separate task should offer explicit import of offline or legacy hosted records. Merge risk: local source changes are reversible; hosted schema is additive but should be rolled forward with data preservation once used. Blast radius is the new personal ledger plus App startup auth ordering and the shared-ipon creation UI. Critical assumptions are active-membership identity, API-role grants and serialized balance checks, with the bounded tests above and fresh Claude review still pending.
