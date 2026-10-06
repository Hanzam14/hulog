# Hulog agent guide

## Day-one execution

Work only in this repository. Read `AGENTS.md` -> `CONTEXT.md` -> `HANDOFF.md`,
then run the declared preflight. Read `docs/SPEC.md` for product requirements
and `SETUP.md` only for the task's setup or manual verification steps. Preserve
unrelated changes and keep credentials, local runtime data, and `.env` private.

<!-- ICM_EXECUTION_START -->
```json
{
  "schema_version": 1,
  "project_id": "hulog",
  "cwd": "C:\\Projects\\Hulog",
  "persistence": "git",
  "privacy": "standard",
  "permission_class": "read-test",
  "runtime": {"kind": "python", "candidates": [["python"]], "probe_argv": ["--version"]},
  "preflight": {"argv": ["npm", "run", "lint"], "timeout_seconds": 120, "expected_exit": 0, "expected_contains": "eslint"},
  "verify": {"argv": ["npm", "test"], "timeout_seconds": 180, "expected_exit": 0, "expected_contains": "passed"},
  "write_policy": "A direct task authorizes ordinary reversible local code, tests, and documentation. Production deployment, cloud writes, credential access, external sends, and money movement require separate confirmation."
}
```
<!-- ICM_EXECUTION_END -->

## Project invariants

- `docs/SPEC.md` is authoritative. Hulog records money; it never holds,
  transfers, or pays out money. Amounts are integer centavos and date rules use
  Asia/Manila.
- Every table has RLS. Client writes use scoped security-definer RPCs with
  explicit grants; actor identity comes from `auth.uid()`. Preserve payment,
  repayment, membership, and cycle locks, history, and soft deletion.
- Keep Google-only sign-in, the two-person group limit, Taglish copy, and
  360px usability. Never add a production test clock or weaken tests.
- Keep `.env`, service credentials, and generated/runtime data out of Git.
  Do not add dependencies or features without a concrete in-scope need.
- No push, cloud project mutation, paid service, or deployment unless the owner
  explicitly requests that action. Never write outside this repository.

## Shared quality loop

Define -> inspect -> change -> verify -> hand off. Follow the shared quality
contract at `C:\Projects\JVC\_config\quality-contract.md` and use checks
proportional to the change. For behavioral proof, state expected behavior, run
a baseline check, and add a discriminating regression test when behavior changes.
Never weaken tests to pass. A canceled required check is not a pass.
If a required tool or check reports context canceled, treat it as a failure.

## Verification and local services

Run `npm run lint`, `npm test`, and `npm run build` for code changes. Before a
database or release change, follow `SETUP.md` for the local SQL suite and manual
OAuth/browser checks. `npx supabase db reset` erases local database data; use
only on a disposable instance. If local Supabase is started, stop it at the end.
Document owner-operated cloud setup and phone smoke checks as incomplete until
they are actually performed.

When `.continuity/policy.json` exists, follow
`C:\Projects\JVC\_config\continuity-contract.md` and
`C:\Projects\JVC\scripts\project_continuity.py`: verify before relying on
state, resume one workstream, use handoff SHA-256 and metadata-revision CAS,
and checkpoint material changes. Never cold-load archives or unrelated state.

Before completion report `Status`, `Changed`, `Checks`, `Risks/assumptions`,
and `Next action`.
