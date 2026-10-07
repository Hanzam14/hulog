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

- Revision: `17`
- Updated: `2026-10-07T04:50:07Z`
- Status: `PARTIAL`
- Persistence: `committed`
- Summary: Warm night notebook dark theme implemented and locally committed; Claude lead screenshot review remains pending before any push.
- Authority: Owner 2026-10-07 supplied Claude lead spec authorizes ordinary local CSS/theme work and main commit with co-author trailer; do not push.

### Decisions

- Dark surfaces: page #17130f, card #26201a, inset #1d1814; muted edges and raised translucent nav.
- Retained visible hard offset shadows after comparing a top-highlight alternative.
- Preserved member fills and all light-mode pixels; updated existing meta-color test expectation to match requested color.
- Owner requested one-agent work and main commit; review is delegated back to the Claude lead as specified, with no push.

### Blockers

- Claude lead screenshot review pending.

### Risks and unresolved items

- Synthetic browser fixture; hosted OAuth and phone smoke were not exercised.
- Lead screenshot review is still pending; screenshots and report are ignored local artifacts.
- Claude lead screenshot/diff review.

### Evidence and checks

- .scratch/dark-result.md
- .scratch/dark/final/metrics.json
- .scratch/dark/final/contrast.json
- .scratch/dark/final/settings-1280-dark.png
- Baseline/final npm.cmd run lint PASS.
- Baseline/final npm.cmd test: 69/69 PASS.
- Baseline/final npm.cmd run build PASS; existing chunk-size and inlineDynamicImports warnings.
- Baseline hierarchy probe failed as expected; final passed. Nine final screenshots visually inspected; no browser errors or horizontal overflow.
- Light Settings 1280: zero changed pixels; member fills unchanged.
- Contrast primary/card 13.51:1; muted/card 6.67:1; muted/page 7.65:1; control border/inset 3.59:1 and border/card 3.28:1.
- git diff --check PASS.

### Governed artifact correlations

- None.

### Exact next action

Claude lead reviews .scratch/dark/final/settings-1280-dark.png and the diff; no push is authorized by this task.
<!-- CONTINUITY_CHECKPOINT_END -->
