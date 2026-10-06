# Hulog

## Purpose

A mobile-first PWA for a two-person paluwagan. Hulog records money; it never
holds, transfers, or pays out money. See [`docs/SPEC.md`](docs/SPEC.md) for the
authoritative product requirements.

## 60-second start

For agent work, read [`AGENTS.md`](AGENTS.md) -> [`CONTEXT.md`](CONTEXT.md) ->
[`HANDOFF.md`](HANDOFF.md), then run `npm run lint`. For local app setup, follow
[`SETUP.md`](SETUP.md), configure `.env` from `.env.example`, then run
`npm ci` and `npm run dev`.

## Current truth

v1 and v1.1 are built and pushed. Hosted Supabase, Google OAuth, Vercel, and
two-phone smoke checks remain owner-operated next steps; see `HANDOFF.md`.

## Work map

- Requirements: `docs/SPEC.md`.
- App source and UI: `src/`.
- Database migrations and functions: `supabase/`.
- Setup and manual smoke procedure: `SETUP.md`.
- Automated checks: `npm run lint`, `npm test`, `npm run build`, and the local
  SQL suite described in `SETUP.md`.

## Boundaries

Keep `.env`, credentials, and runtime data private. Hulog does not move money.
Do not perform hosted cloud writes, credential access, or deployment without
the owner's explicit request.
