# Hulog

A mobile-first PWA for a two-person paluwagan. Record daily contributions,
confirm payments, track each cycle's pot, and settle debts. Hulog records money;
it never moves money.

React + TypeScript + Vite, Tailwind, and Supabase. All money is integer centavos;
write deadlines use the database's Manila calendar date.

See [SETUP.md](SETUP.md) for local development, Google sign-in, and deployment.
The authoritative requirements are in [docs/SPEC.md](docs/SPEC.md).

v1 is implemented. v1.1 push notifications are deferred; there are no push
subscriptions, notification permissions, cron jobs, or Edge Functions in v1.

Run `npm ci`, configure `.env` using `.env.example`, and run `npm run dev`.
Checks: `npm run build`, `npm run lint`, `npm test`, `npx supabase test db`
(start local Supabase first with `npx supabase start`; stop it when finished).

Licensed under [MIT](LICENSE).
