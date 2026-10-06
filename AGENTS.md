# Hulog agent guide

## Startup

Work only in this repository. Read `docs/SPEC.md` (authoritative), this file,
and `SETUP.md`; inspect `git status` and preserve unrelated changes. The spec
is v1 plus optional v1.1. Current implementation is v1 only.

## Commands

- `npm ci`; `npm run dev`
- `npm run build`; `npm run lint`; `npm test`
- `npx supabase start`; `npx supabase test db`; `npx supabase stop`
- `npx supabase db reset` destroys local database data: only on disposable data.

## Rules

Follow SPEC §3–4 exactly. Integer centavos; calendar dates in Asia/Manila.
All write deadlines come from `hulog_today()` in SQL. No production test clock.
Every table has RLS; client writes use security-definer RPCs with a pinned
`public, pg_temp` search path and explicit role grants. Actor comes from
`auth.uid()`; load each target through the actor's active group. Derived views
use `security_invoker`. Lock the group for proposals and membership approval;
lock the cycle for payment/repayment caps, including corrections.

Preserve history and soft deletions. Never weaken tests to pass. Keep Taglish
copy, 360px usability, Google-only sign-in and two-person rules. Don't add
dependencies or features without a concrete in-scope need.

No remote, push, cloud project, paid service, or deployment unless explicitly
requested. Do not write outside the repository. Commit logical changes; append
the requested co-author trailer. Always stop local Supabase at the end.

## Verification

Run build, lint, unit tests and local SQL tests before reporting completion.
SQL tests include the entire SPEC §7 worked example, negative permission and
deadline tests, and an actual concurrent invite claim. The clock override is
only inside a rolled-back test transaction. Document required manual OAuth,
browser, and cloud setup checks honestly. v1.1 can begin only after v1 passes.
