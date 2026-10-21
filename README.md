# Hulog

A mobile-first PWA for tracking a two-person paluwagan (rotating savings) and
shared savings goals. Live at **https://hulog.vercel.app** and in daily use.

Hulog records money; it never holds, transfers, or pays out money. See
[`docs/SPEC.md`](docs/SPEC.md) for the authoritative product requirements.

<p>
  <img src="docs/simplify-shots/light-home-top.jpg" alt="Home screen, light theme" width="240">
  <img src="docs/simplify-shots/dark-tracker.jpg" alt="Payment tracker, dark theme" width="240">
  <img src="docs/simplify-shots/light-history.jpg" alt="History, light theme" width="240">
</p>

## Features

- Paluwagan rounds for two members: record each payment ("hulog"), see who
  receives the pot next, and close a full round early.
- Shared savings goals with mutual confirmation, plus personal savings goals
  that each member can keep private or share read-only.
- Named wallets showing who holds the money, and a shared-expense ("abono")
  tracker.
- Push notifications in the member's chosen language (English, Tagalog, or Taglish).
- Google sign-in, an offline solo mode on one device, and light and dark themes,
  usable down to 360px wide.

## Stack

React + TypeScript (Vite), Supabase (Postgres, Auth, Edge Functions), and
Vercel hosting.

- Every table has row-level security. Clients write only through scoped
  security-definer RPCs, and the acting user always comes from `auth.uid()`.
- Amounts are integer centavos; date rules use Asia/Manila.
- Payment, membership, and cycle rules are covered by Vitest unit tests and a
  pgTAP SQL test suite in `supabase/tests/`.

## Run locally

Follow [`SETUP.md`](SETUP.md), copy `.env.example` to `.env`, then:

```bash
npm ci
npm run dev
```

Checks: `npm run lint`, `npm test`, `npm run build`, and the local SQL suite
described in `SETUP.md`.

## License

MIT, see [`LICENSE`](LICENSE).
