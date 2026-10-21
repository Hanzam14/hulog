# Hulog round 2: solo-mode fix + personal savings inside a group, 2026-10-21

Lead/reviewer: Claude Opus. Builder: Sol. Same worktree and branch as round 1: `C:\Projects\Hulog-wt-cute`,
`design/cute-refresh`. Same rules as `task-briefs/cute-refresh-20261021.md` (no push/merge/deploy, i18n triples,
360px, light+dark), EXCEPT this round may change `supabase/`, `src/data.ts` and `src/solo.ts` as described below.
Never touch hosted Supabase, Vercel, `.env` or secrets. Commit on the branch when checks pass.

## 0. Base

`antigravity/solo-mode` on origin is 1 commit ahead of the local branch this worktree started from (`cf32c85`).
`git fetch origin` and merge `origin/antigravity/solo-mode` into `design/cute-refresh`; resolve conflicts keeping the
round-1 design. Report the merged commit.

## 1. Solo mode button bug

Owner likes solo mode. Observed 2026-10-21 on the dev server (C:\Projects\Hulog at `cf32c85`, real `.env` present):
on the landing page, clicking "Mag-solo muna sa device na ito" left the landing page on screen (page text unchanged
after 2s). Reproduce, find the root cause (e.g. Supabase-configured path ignoring solo state, routing, or the handler),
add a regression test that fails on the baseline. Clue: in round 1 solo mode worked for you in the worktree, which
has no `.env`; the failing run had `.env` with Supabase configured. Do not copy or read `.env` values — stub the env in
tests (see `src/data.test.ts`). Then add a regression test that fails on the baseline, fix it, and show the test passing. Also check that leaving solo mode
and signing in later still works.

## 2. Personal savings inside a group (new feature)

Owner's partner wants to save her own money while they share a group. Each member of a group can create personal
savings (ipon) goals that belong only to them.

- Owner decisions (2026-10-21): each goal has a visibility choice, **private** (only the owner sees it) or **shared**
  (the partner can see it, read-only). Default: private. The owner can switch it any time. Goals **sync online**
  (stored in Supabase, not just the phone).
- First read `docs/SPEC.md` and the existing ipon/goal schema and RPCs. Prefer extending the existing ipon model with an
  owner + visibility if it fits the spec; otherwise add a table. Explain the choice in the report.
- Database invariants (AGENTS.md): every table has RLS; client writes only through scoped security-definer RPCs with
  explicit grants; actor = `auth.uid()`; amounts integer centavos; Asia/Manila dates; history + soft deletion kept.
  Hulog records money, never holds it.
- Access rules to enforce and test in pgTAP: owner can create/read/update/soft-delete own goals and entries; partner in
  the same group can read a goal and its entries only when visibility = shared, and can never write; when the owner
  switches shared→private the partner immediately loses read access; a non-member sees nothing; anonymous sees nothing.
- One new migration file. Do NOT apply it to hosted Supabase; the owner does that after review. Write the exact apply
  steps in the report.
- UI: on Home, a "Sariling ipon" (personal savings) section under the shared pot for the signed-in member, with create,
  record deposit/withdrawal, and a clear private/shared toggle (lock icon vs eye icon, labelled in words too). Shared
  goals of the partner show read-only with their name. Reuse the round-1 design tokens and existing components
  (IponCard/IponDetail/RecordIpon) where possible. Reconcile with the `cf32c85` solo-goals-in-partnered-pot local mode
  so there is one concept, not two.
- Update `docs/SPEC.md` for the new behavior.

## Verification

`npm run lint`, `npm test`, `npm run build` (baseline + after). Local pgTAP suite per `SETUP.md` on a disposable local
Supabase only (stop it at the end); if Docker/local Supabase cannot run in your sandbox, say so plainly — do not claim
SQL checks passed. Screenshots at 375px light/dark of the personal-savings section, private and shared states, into
`design-shots/`.

Report: changed files, migration name, root cause of the solo bug + regression test name, pgTAP results (or not run),
check results, apply steps for the owner, open questions, commit hash.
