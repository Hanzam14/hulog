# Hulog handoff

<!-- CONTINUITY_STATE: .continuity/state.json -->
<!-- ICM_CONTEXT_PROFILE: v2 -->
<!-- ICM_OPERATIONS_PROFILE: v1 -->

## Last verified

- Date: 2026-10-07
- Production is live through `7d94a7e` (owner-provided state).
- Push-language branch baseline: lint PASS; 66/66 unit tests and build PASS
  with Vite runner mode because default config bundling hits `EPERM` through the
  `node_modules` junction.
- Push-language branch final: lint PASS; 69/69 unit tests and build PASS with
  Vite runner mode. Local pgTAP NOT RUN: Docker is unavailable.

## Active brief

`feat/push-language` adds per-user push-language storage and localized notice
text. Independent Claude lead review of this branch diff is pending. Its
migration and Edge Function update are pending review and owner apply/deploy;
no hosted writes or deployment were performed here.

## Current state

Production is live through `7d94a7e` with the language picker, tablet/desktop
layout, transient notices, decline-hulog action, mutual payment confirmation,
give-payout hand-off, hero pot card, and Sonnet review fixes. Hosted migration
`20261007000200_mutual_confirm` is applied and the `notify` Edge Function is
deployed. Sol work was reviewed by Claude Opus (SQL) and Sonnet (UI/i18n); Luna
fixes were reviewed by Claude Opus.

This branch adds a `language` preference (`en`, `tl`, `taglish`) and selects
localized push titles/bodies per recipient. Its local migration is
`20261007000300_notification_language.sql`; production apply and Edge Function
deployment remain pending the Claude lead. This branch has not been pushed or
deployed.

## Current phase

Live use and polish.

## Assumptions and unknowns

- Full two-phone smoke test per `SETUP.md` remains incomplete.
- The app records money and does not hold or transfer funds.

## Human decision needed

- Status: production apply/deploy and two-phone smoke test remain owner tasks.
- Decision: none blocking for this local branch.
- Owner: Hulog owner

## Next action

Claude lead applies the migration and deploys the updated `notify` function;
owner then runs the `SETUP.md` two-phone smoke test and reports results.

## Revalidate when

Hosted setup, deployment, a relevant automated check, the two-phone smoke test,
or the current owner decision changes.

<!-- CONTINUITY_CHECKPOINT_START -->
## Continuity checkpoint

- Revision: `15`
- Updated: `2026-10-07T04:24:06Z`
- Status: `PARTIAL`
- Persistence: `committed`
- Summary: Push-language implementation is committed on feat/push-language. Independent Claude lead review, production apply/deploy, and two-phone smoke remain pending.
- Authority: Owner's explicit Hulog task brief dated 2026-10-07 authorizes local implementation, checks, handoff/checkpoint, and branch commit; hosted apply/deploy remains owner-operated.

### Decisions

- Push-language workstream is HELD pending independent review and owner-operated release steps.

### Blockers

- Independent Claude lead review of this branch diff is pending.
- Local pgTAP NOT RUN because Docker is unavailable.
- Owner apply of migration and notify deployment remain pending.
- Two-phone smoke test remains incomplete.

### Risks and unresolved items

- Local pgTAP coverage is unverified because Docker is unavailable.
- Independent review has not yet confirmed this branch diff.
- Independent Claude lead review.
- Apply migration and deploy notify to production.
- Complete two-phone smoke test.

### Evidence and checks

- supabase/migrations/20261007000300_notification_language.sql
- supabase/tests/database/rules.test.sql
- src/notificationSelection.test.ts
- HANDOFF.md
- Baseline lint PASS.
- Baseline unit tests 66/66 PASS with Vite runner mode.
- Baseline build PASS with Vite runner mode.
- Final lint PASS.
- Final unit tests 69/69 PASS with Vite runner mode.
- Final build PASS with Vite runner mode.
- pgTAP NOT RUN: Docker executable unavailable; five focused assertions added.
- Continuity verify and audit PASS.

### Governed artifact correlations

- None.

### Exact next action

Claude lead reviews the branch diff; after review, applies the migration and deploys notify. Owner completes the two-phone SETUP.md smoke test.
<!-- CONTINUITY_CHECKPOINT_END -->
