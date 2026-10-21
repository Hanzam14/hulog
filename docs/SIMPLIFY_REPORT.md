# UI simplification report (2026-10-21, branch `design/simplify`)

Presentation only. No SQL, RPC, lock or permission changes; moved components keep their props and behavior.

## What moved where

- **Nav**: visible labels under each icon: Home / Gastos / History / Grupo (i18n in all three languages).
- **Header**: "Sign out" moved to the bottom of Group ("Iba pa"). It stays in the header only when no active group is shown (loading, pending, denied, no group), so it is never unreachable.
- **Home** (top to bottom): Waiting for your check (hidden when empty) -> current round card with countdown, tally, one big "hulog!" / "new round" button, Payout -> one "Ipon" section (shared goals, personal goals, then two small quiet add buttons side by side).
  - Removed from Home: Kami/Solo toggle, Switch/Exit solo mode buttons, CustodyCard, pot-location line, "Sa device na ito lang..." paragraph, the empty "No ipon goals yet" text, and the solo button in the empty state.
  - Personal goal cards: "Gawing private / Ipakita sa partner" now sits in the existing "Ayusin ang goal" disclosure; records were already a disclosure.
- **Group** (`Settings.tsx`), three headed sections:
  - Grupo: members, group name, pot location, custody card, wallets (add form collapsed), Together/Solo toggle, switch/exit solo, solo caveat line, join requests and invite.
  - App: appearance, language, install hint, notifications (reminder time collapsed).
  - Iba pa: CSV, version + check for update, sign out.
- **History**: empty state shows only the empty-state line. Filters, totals and Print appear only when there are past rounds or goals. The "new round" button is gone.
- **Tracker**: heading now "Hatian sa gastos" (EN "Split expenses").

## Files changed

`src/App.tsx`, `src/screens/{Home,Settings,History,Tracker}.tsx`, `src/components/{PersonalSavings,WalletsSettings,NotificationSettings}.tsx`, `src/i18n.ts` (keys Expenses, Grupo, App, More, Split expenses in en/tl/taglish), `src/style.css`, tests `src/App.solo.test.ts`, `src/components/v2.test.ts`, plus `docs/SIMPLIFY_REPORT.md` and `docs/simplify-shots/`.

## Tests changed

- `App.solo.test.ts`: the sign-out helper now also finds Group's `onSignOut` (the harness reads the element tree, which now includes Route elements). All sign-out flow assertions are unchanged.
- `v2.test.ts`: Home no longer expects the custody card, "Ipon goals" heading, the empty-goals sentence, or "Exit solo mode"; History empty no longer expects a `/propose` link. Added: Home has no Together/Pot mode/custody and Group has them; Group has "Exit solo mode". `InstallSettings` is mocked for SSR of Group (like `AppUpdates` already was).
- No behavioral assertion was removed.

## Checks

- `npm.cmd run lint`: pass, no warnings.
- `npm.cmd test`: 136 passed / 136 total (16 files).
- `npm.cmd run build`: pass.

## Screenshots

`docs/simplify-shots/` (360x780 viewport, 2x for Home top, History, Tracker, Group top): `dark-*` and `light-*` for Home (top, ipon), Group, History (empty), Tracker. Group middle/bottom exist for dark only.

## Not done / notes

- Demo solo data has no pending confirmation, so the "Waiting for your check" section was not captured.
- Group section headings are small caps labels while the existing sub-sections keep their own h2s.
- Desktop (2-column) layout of Group was not visually checked.
- Quiet add buttons hide while the personal-goal form is open (the "New ipon goal" link returns after closing).
