# Hulog tasks for Antigravity (Argon lead), 2026-10-19

Paste one task at a time into Antigravity, opened on `C:\Projects\Hulog`. Each task counts as one probation PR.

## Rules for every task (paste these with the task)

```
Project: C:\Projects\Hulog (React + Vite + Supabase paluwagan record app). Read AGENTS.md, CONTEXT.md and docs/SPEC.md first.
Work only on a new branch antigravity/<task-slug> cut from main. Never commit to main, merge, deploy or force-push.
Do not touch: supabase/ (migrations, RLS, functions), auth/sign-in code, push-notification backend, .env or any secrets,
package.json dependencies, .github/, .agents/, .claude/, Vercel or Supabase settings. Delete no files.
Every new user-facing string goes in src/i18n.ts in English, Tagalog and Taglish.
Before you push, run: npm run lint, npm test, npm run build. All three must pass.
Push the branch and open a PR to main describing what changed, with screenshots at phone width (375px) in light and dark mode.
Stop after opening the PR; it gets an outside review before merge.
```

## 1. Translation check (start here)
```
Task slug: i18n-audit. Find every user-facing string in src/ that is hard-coded instead of going through src/i18n.ts,
and every i18n key missing a Tagalog or Taglish value. Move the strings into i18n.ts and fill in the missing translations
in natural, casual Filipino. Keep wording short enough for phone screens. List each changed key in the PR.
```

## 2. Phone layout check (start here)
```
Task slug: mobile-qa. Run the dev server and check every screen in src/screens/ at 375px and 414px wide, light and dark
theme. Fix overflow, clipped text, cramped spacing and tap targets smaller than 44px, using CSS and layout changes only.
In the PR, include a before/after screenshot per fixed screen and a list of anything you saw but didn't fix.
```

## 3. Empty screens
```
Task slug: empty-states. When History, Tracker, Ipon (IponCard/IponDetail) and NoGroup have nothing to show, display a
short friendly message and one clear next-step button that goes to the existing screen for that action. No new data calls.
```

## 4. "Next payout" countdown on Home
```
Task slug: payout-countdown. On the Home screen, show a small line such as "Payout in 3 days - your turn" or
"Payout in 3 days - <partner>'s turn", using data Home already loads (see docs/SPEC.md for cycle and payout rules).
Compute it in a pure helper in src/helpers.ts and add unit tests covering today, tomorrow, overdue and no-active-cycle.
```

## 5. Ipon goal progress
```
Task slug: ipon-progress. In IponCard and IponDetail, show a progress ring (percent saved toward target) and an
"On track" / "Behind" label based on the goal's existing cadence data. When a goal reaches 100%, play the existing
src/components/confetti.ts once. Put the progress maths in a pure helper with unit tests.
```

## 6. History filters
```
Task slug: history-filters. On the History screen, add filters by month and by member, plus a "Print summary" button
that opens a clean print layout (CSS @media print) of the filtered list with totals. Filtering happens on the client over
the data already loaded. Add unit tests for the filter and total helpers.
```

## 7. Loading and offline
```
Task slug: loading-offline. Show placeholder skeleton blocks while screen data loads, and a small banner when the
browser goes offline (navigator.onLine plus online/offline events), hidden again when back online. Don't change
src/sw.ts caching behaviour.
```

## After each PR
Tell Claude or Codex: "review Hulog PR <number> from Antigravity". The review must pass before you merge. Then record
the result in the probation ledger (`C:\Projects\JVC\references\ANTIGRAVITY_TRUST_CARD.md`).


## Note for Claude Opus and Sol reviewer: Owner-requested Solo Mode

The owner explicitly requested Solo Mode as an additional feature after this task brief was created.
Solo Mode enables standalone savings rounds and Ipon goals on a single device without waiting for a partner to join or confirm.
