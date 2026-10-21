# Brief: Simplify Hulog UI ("deslopify") — 2026-10-21

Lead: Claude Opus (spec + review). Builder: Sol (gpt-6.1-sol, medium, default tier).
Repo: `C:\Projects\Hulog`, branch `design/simplify` (already checked out). Work only in this repo. Do not push, merge, deploy, or touch hosted Supabase. No new dependencies. No SQL/migration changes — this is presentation only.

## Goal

Owner: "too much going on — make the UX/UI as intuitive as possible, deslopify it, make it simpler." Every existing feature stays reachable; we remove clutter, reorder by importance, and cut copy. Keep Taglish/English/Tagalog i18n (add new keys in all three languages in `src/i18n.ts`), the cute ube sticker look, 360px usability, 44px touch targets.

## Principles (apply everywhere)

1. One obvious primary action per screen.
2. Things that need the user (confirmations) come first, not last.
3. Rare settings/modes live in Group (settings), never on Home.
4. No duplicated info or buttons across screens.
5. Short copy: one idea per line, no explanatory paragraphs where a label works. Delete helper sentences that restate the label.
6. Don't show empty scaffolding (filters, totals, headers) when there's no data.

## Changes

### Nav (`src/App.tsx` bottom `<nav>`)
- Show a visible short label under each icon (not sr-only): Home / Gastos / History / Grupo (and EN/TL equivalents via i18n). Keep icons.

### Header
- Move "Sign out" out of the header into the bottom of Group/Settings. Keep the bell if it's functional.

### Home (`src/screens/Home.tsx`), new order top → bottom
1. **Waiting for your check** (the existing `confirm-list` block: pending payments, ipon contributions, abono) — move to the top, with a small heading. Hidden when empty (as now).
2. **Current round card** (`CycleCard`) with the countdown line folded inside/just under it, the tally sheet, then the single big primary button "hulog!" (or "new round" when there's no live round, or Proposal accept UI when proposed). `Payout` stays with the round.
3. **Ipon** — one section, heading "Ipon". Inside it: shared ipon goals (`IponCard`) and personal goals (`PersonalSavings`) as compact cards. One "+ Bagong goal" entry point for the section is preferred; if keeping the two creation buttons is materially simpler for the data flow, keep them but render them as small secondary/quiet buttons side by side at the bottom of the section, not two big buttons. In `PersonalSavings` collapse each goal's detail actions (Dagdag/Bawas visible; "Gawing private", records, edit tucked behind the existing details/disclosure) so each card is short. Remove the "Sa device na ito lang…" paragraph from Home; if solo/offline caveat is needed, show it once in Group.
- **Remove from Home:** the Kami/Solo segmented toggle, the "Switch to solo mode"/"Exit solo mode" buttons, `CustodyCard` ("Nasaan ang pera natin"), and the pot-location line. Move all of them to Group (below).
- Empty state (no round): one short line + the "new round" primary button. No solo-mode button there.

### Group (`src/screens/Settings.tsx`)
Group into a few clearly headed sections, in this order:
1. **Grupo**: members, group name, the "Nasaan ang pera" custody summary (`CustodyCard`), wallets, pot location, Together/Solo mode toggle and solo-mode switch/exit.
2. **App**: appearance, language, notifications.
3. **Iba pa**: CSV export, check for update + version, sign out.
Collapse rarely used blocks (wallet add form, notification time) behind a disclosure where it reduces length without hiding status.

### History (`src/screens/History.tsx`)
- When there are no past rounds/records: show only the empty-state line. Hide month/member filters, totals, and print until there is data.
- Remove the "bagong round" button from History (it lives on Home).

### Tracker (`src/screens/Tracker.tsx`)
- Shorten heading copy (e.g. "Hatian sa gastos"); keep the add action as the single primary button. Trim any explanatory paragraph that repeats the heading.

### Copy pass
Across these screens, cut filler phrases and duplicated hints. Keep legal/invariant line "Records only. No money moves through Hulog." once (footer is fine).

## Constraints
- Do not change data logic, RPC calls, locks, or permissions. Moving a component must not change its props/behavior.
- Tests: update tests only where they assert the old layout/location (e.g. a button now in Group instead of Home) — keep every behavioral assertion; never delete or weaken a behavior check. Add a small test that Home no longer renders the mode toggle/custody card and Group does.
- Keep `aria` labels meaningful.

## Done when
- `npm run lint`, `npm test`, `npm run build` all pass (report counts).
- 360x780 screenshots (light + dark) of Home (solo mode with a round, a personal goal and a pending item if feasible), Group, History empty, Tracker saved under `docs/simplify-shots/`.
- Short report `docs/SIMPLIFY_REPORT.md`: what moved where, files changed, checks with counts, anything not done and why.
- Commit on `design/simplify` with a clear message. Do not push.
