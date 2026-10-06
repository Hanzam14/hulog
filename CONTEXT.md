# Hulog context

<!-- ICM_CONTEXT_PROFILE: v2 -->
<!-- ICM_OPERATIONS_PROFILE: v1 -->

## Day-one map

- Primary user/audience: the Hulog owner and the two members of a group.
- Job to be done: operate and maintain a two-person paluwagan record app.
- Input lane: the scoped task and `docs/SPEC.md` product authority.
- Active work lane: one requested source, test, database, or setup task.
- Reviewed/final output lane: this repository; JVC stores routing and compact
  cross-project metadata only.
- Default exclusions: `.env`, credentials, local runtime data, `node_modules`,
  `dist`, generated output, and unrelated projects.

## Authority map

| Question | Read first | Authority | Revalidate when |
|---|---|---|---|
| Project and execution boundary | `AGENTS.md` | Root execution contract | Scope or permission changes |
| Current state and next action | `HANDOFF.md` | Verified Hulog handoff | Hosted setup or verification changes |
| Product behavior | `docs/SPEC.md` | Hulog product specification | Feature or database behavior changes |
| Setup and manual checks | `SETUP.md` | Owner-operated setup instructions | Provider setup or deployment changes |
| Implementation and tests | `src/`, `supabase/` | Source and automated tests | Relevant code or migration changes |

## Human judgment

- Model may decide: scoped local source, test, and documentation changes.
- Human decides: hosted project creation, live cloud writes, OAuth secrets,
  deployment, external publication, and money movement.
- Stop conditions: unclear authority, failed declared checks, credential access,
  or a live service boundary.

## Current phase

Owner-operated hosted setup and two-phone smoke testing; see `HANDOFF.md`.

## Boundaries

Hulog records money; it never holds or moves money. Keep credentials and runtime
data out of Git. Do not mutate hosted Supabase, Google OAuth, or Vercel without
the owner's explicit request. The deployed application and hosted data remain
owner-managed; this repository is the source of truth.

## Success criteria

- Root startup identifies authority, current state, checks, and exact next action.
- A new task loads only the named product, source, test, or setup context.
- Automated tests and database security invariants remain intact.
- One fact has one authoritative home; JVC does not duplicate app state.

## Revalidate when

The product specification, execution authority, hosted configuration, continuity
state, or a material implementation changes.
