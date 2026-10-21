# Claims: personal savings and configured solo entry

Builder: Sol (gpt-6.1-sol, medium). Fresh reviewer required: Claude Opus, high effort for security/money. Status: pending independent review; no verdict is claimed here.

Review with `C:/Users/Hoybos/.agents/bin/review-rubric.md`. Review both requested behavior and quality, try counterexamples, and rule on every decision below. Use the existing review_gate.py --begin-review / --record-pass workflow; do not turn this builder packet into an attestation.

Base: design/cute-refresh; origin/antigravity/solo-mode 4706a11 merged via e255d6d. Compare the feature against e255d6d, and consider the retained round-1 design when judging UI.

## Claims

- C1: The real App handler/effect test `keeps solo open when a delayed initial auth session resolves` failed before the auth fix (solo-baseline.log), and the four configured-Supabase cases now pass in the final 132-test run. A second regression reproduces a stale startup read replacing a later online session after leaving solo. The test env/key are stubs; real OAuth is not covered. Inspect App auth ordering, not only the test harness.
- C2: The disposable local pgTAP run in round2-final-sql.log reports Result: PASS, 357 assertions across six files, including the 60 new personal access/balance/history assertions. Those cases exercise owner writes, partner private denial/shared reads/denied writes, shared-to-private revocation, group-creator privacy, non-member/anonymous denial, direct-table write denial, retained audit, soft deletion and invalid balance/date/visibility cases. This is local evidence, not a claim about deployed policy.
- C3: The source migration defines three RLS tables, SELECT-only grants to authenticated, four scoped security-definer RPCs with fixed search paths, and private helpers without API execute grants. Creation derives actor/group; mutations lock the owner goal and retain audit snapshots outside the group history feed. Verify these source facts and seek bypasses in direct table access, existing helper grants, views and JSON audit data. Cross-connection withdrawal contention was not stress-tested.
- C4: `npm run lint`, `npm test`, and `npm run build` each returned exit 0 in round2-final-results.json. The test log reports 132 passing tests in 15 files. That run includes local ledger math/soft deletion/audit, idempotent legacy conversion, local-mode preservation, online data-table/RPC dispatch, and partner card rendering without write controls. It does not constitute a real two-device sync check.
- C5: The new UI presents private-by-default creation, explicit lock/eye visibility labels and toggle, owner deposit/withdrawal/correction/deletion controls, owner history and named read-only partner cards. The shared proposal form points personal goals to Home and the standalone form uses the personal component. Browser smoke created a synthetic private Camera goal, recorded 1000 pesos, withdrew 200, corrected the deposit to 1200 and displayed 1000. Read-only partner rendering has SSR and SQL role evidence; screenshots show owner states.
- C6: Final samples named corrected-light, create-light-final, private-dark-final, shared-dark-final and create-dark-final in round2-qa-360.json have no overflowing personal-section elements or visible target below 44px. Four screenshots preserve the browser's native 360x780 export from the requested/observed 375x812 CSS viewport. They are viewport captures; full-page capture timed out. No claim covers every device/state or exact 375-pixel image resolution.

## Decisions

- D1: Add dedicated personal goal/entry tables rather than extending shared ipon, because ownership, withdrawal and confirmation contracts differ. Reuse design classes and progress/forms rather than force the existing shared-ipon component types.
- D2: Use a separate owner-only audit table; do not let private records or balances enter shared custody/history. Shared partners read active goal/entry rows, never audit snapshots. Deleted rows remain available to the owner for history.
- D3: Default new goals private; permit the owner to switch visibility at any time without partner approval. Shared goals confer read access only.
- D4: Keep integer centavos from 1 to 10000000000, a current balance of 0 to 10000000000, and permit deposits above target. Use the existing ipon target ceiling; no shared three-goal cap on personal goals. Validate the current balance, not a historical daily balance.
- D5: Serialize all entry mutations on the goal row, including edits and deletions; reject operations that overdraw. Entry kind is immutable, title/target/visibility are editable, dates cannot be future Manila dates and notes cap at 140 characters.
- D6: Soft-delete goals/entries with retained audit; a goal may be deleted at a nonzero recorded balance because no money is held. No restoration UI is added in this task.
- D7: Consolidate local legacy [Solo] goals once, retaining their balance/notes/IDs and prior shared visibility, while new personal goals default private. Preserve personal data when switching preview modes. Keep the preview explicitly local-only and do not silently upload it.
- D8: Do not silently reclassify existing hosted [Solo] shared-ipon records; keep their original contract. Remove the old personal-choice path from new shared proposals, clean typed legacy prefixes there, and direct personal saving to Home.
- D9: Keep Supabase auth subscribed even when starting in saved solo mode. Let newer auth events outrank initial reads, ignore initial reads during solo, and reject reload results from the other data mode. Regression tests mock hooks/effects rather than add a new DOM dependency.
- D10: Keep cloud apply, real OAuth and phone/two-device smoke for the owner after fresh review. Use only a separate disposable local Supabase. Viewport screenshots are accepted with their native export dimensions disclosed; no screenshot upscaling or synthetic online identity is used.

## SHA-256 files for review

| Full path | SHA-256 |
|---|---|
| `C:/Projects/Hulog-wt-cute/AGENTS.md` | `9c3acd187e47d048d8e845ac4231181aba56ffc6c2f83f26265bb34ea6df0efd` |
| `C:/Projects/Hulog-wt-cute/docs/SPEC.md` | `6fac598c3d570233ac360b16fd9ecf47afc5c46b91989e44c140223ee6d26948` |
| `C:/Projects/Hulog-wt-cute/docs/PERSONAL_SAVINGS_REPORT.md` | `3d1fdf6c4e2ed1032a04ba214537cfc15a605bfa2c606ace9232b5855369d811` |
| `C:/Projects/Hulog-wt-cute/src/App.tsx` | `af0894b6a216b6248b25fdd336544956fa0a59ddc3fccfb43315d34f635cde05` |
| `C:/Projects/Hulog-wt-cute/src/App.solo.test.ts` | `e4c9f6993720fd79e8fa2e21db541b6f2e8536ac956f48f17772a375fded0e44` |
| `C:/Projects/Hulog-wt-cute/src/data.ts` | `08bed137963a017e3992357dd371663b288ca51234075698af7dadbc8ee8f018` |
| `C:/Projects/Hulog-wt-cute/src/data.test.ts` | `a8d2b5c9188c3c564ff21ae999e4208a077dedf447f7c8597c2c9253fc629cdc` |
| `C:/Projects/Hulog-wt-cute/src/personal.ts` | `3cdca099788e9cb1388a6eeaec4a29dd36b597a977af6220f2af26e24ffe8e8c` |
| `C:/Projects/Hulog-wt-cute/src/personal.test.ts` | `a601fe0ad30d2597acfbd407ad014ce930d643bd6e3140e49aa395885ebe609f` |
| `C:/Projects/Hulog-wt-cute/src/solo.ts` | `c371ee9a6c2eb78d4a0e4be2d0f8fad7b92216171394fbaf8bd38a258763ee52` |
| `C:/Projects/Hulog-wt-cute/src/components/PersonalSavings.tsx` | `bee3c2b8b93f44daccefc74da06bed4d63ac83260d3384ad6d964e47ebc953eb` |
| `C:/Projects/Hulog-wt-cute/src/components/v2.test.ts` | `e82384e8be6fa8999821e1402f78919eaa1912b6d58180ecc1fd9a67290c53ec` |
| `C:/Projects/Hulog-wt-cute/src/screens/Home.tsx` | `260552a29e9f89fb643c613cdc45d8da9a52688e2a5dcfb5c4dc2a8fb9c978a4` |
| `C:/Projects/Hulog-wt-cute/src/screens/ProposeIpon.tsx` | `9ddfdefad54755baf549b3ff4089e58aaa2c1892b2b6e21e1139b07a0ddea7a7` |
| `C:/Projects/Hulog-wt-cute/src/screens/proposals.test.ts` | `58a3555d936022adc43c9dc9aaf44cf36201569ae3d1daef6747d676388b2fa2` |
| `C:/Projects/Hulog-wt-cute/src/style.css` | `302fc6ba22e5118dbdc586c86d641408d0823e22fb281313a5e758cc94c25a34` |
| `C:/Projects/Hulog-wt-cute/src/i18n.ts` | `1ed07a002a5024e2059ce409de1580d4b5f0b99dc50be4688d2368ba1d8f2896` |
| `C:/Projects/Hulog-wt-cute/src/helpers.ts` | `2e7a0e101d1647f8b248ab34c6b9e7c2d3528ebab07331aed1f268c80fc66375` |
| `C:/Projects/Hulog-wt-cute/src/components/IponCard.tsx` | `944195265227de1732f006d2be3ff7d053d1e625c398688c9a6df6e84f03d3a5` |
| `C:/Projects/Hulog-wt-cute/supabase/migrations/20261006000100_hulog.sql` | `5d2e367d8144d9f4453733d24672a4b3f9e03dbac4df9cf937d9b6280f18a2be` |
| `C:/Projects/Hulog-wt-cute/supabase/migrations/20261017000100_hulog_v2_companion.sql` | `e0c195329369b341080313b7950f4bddd4ac645b3d423aae8ccf660e1cf8288e` |
| `C:/Projects/Hulog-wt-cute/supabase/migrations/20261021000100_personal_savings.sql` | `4abbe29299cd13d2140fa9100714cb8836e4db5a342bb7c4946d892bd9d20d1c` |
| `C:/Projects/Hulog-wt-cute/supabase/tests/database/personal_savings.test.sql` | `05de46a9bce656ddbd85b8674f1ef4da0e038d7deb84f46b15b64c7bce23f0a4` |
| `C:/Projects/Hulog-wt-cute/.scratch/solo-baseline.log` | `6a1ea577a0cc2a9d885956f236292311bab9fea0dde591a2823b244703b383bc` |
| `C:/Projects/Hulog-wt-cute/.scratch/solo-reentry-baseline.log` | `64a999bd700300c6a2345d3cb26ab15979b066583dbb9ac4955212b65c39370f` |
| `C:/Projects/Hulog-wt-cute/.scratch/solo-after.log` | `1118aa05f1670708d5f1df86367b846d87dfa89cafbd0f99e405239190615400` |
| `C:/Projects/Hulog-wt-cute/.scratch/round2-final-results.json` | `f5b968ea628db6610083595d2914d4d790d35b34c248eae9f5a0a26b36271bb5` |
| `C:/Projects/Hulog-wt-cute/.scratch/round2-final-test.log` | `03a2b3133430b752b9a56dbf428897f9e501557151ccc0f314d24928cee0ef5d` |
| `C:/Projects/Hulog-wt-cute/.scratch/round2-final-build.log` | `60d75c49adfb6837fa82a5c9aa40d96c4a93bc83d45eecdbd3aacf4a6d8fd37d` |
| `C:/Projects/Hulog-wt-cute/.scratch/round2-final-lint.log` | `496def06cf561987953807aa7d9e5667ba403b4b8ccf320feecbad366ec2c96b` |
| `C:/Projects/Hulog-wt-cute/.scratch/round2-final-sql.log` | `b270fce9d23aab47e07b04d8527146fc1c65a7e491815f7f1534ed97f2c5ff9f` |
| `C:/Projects/Hulog-wt-cute/design-shots/round2-qa-360.json` | `4dcb1bde5b82914e20eef2ab2e9e6fc626c80f3efe223e0bbc21045cc8451a5e` |
| `C:/Projects/Hulog-wt-cute/design-shots/round2-personal-private-light.png` | `a1228ee4a0bbb58e99b0730a7d318a3435b4ce334519121114e2befd23c53784` |
| `C:/Projects/Hulog-wt-cute/design-shots/round2-personal-private-dark.png` | `f97b1eb8a3c7a12ff830a0f508d5eaaaad9cb0aace7fa4cb7e5b7cd791794009` |
| `C:/Projects/Hulog-wt-cute/design-shots/round2-personal-shared-light.png` | `cba014513cadaa782fdbd34f65d6defb8ad522c532129c859709c722f9865670` |
| `C:/Projects/Hulog-wt-cute/design-shots/round2-personal-shared-dark.png` | `672e3512cfff8bc26108e01de56aafaff3915d9ecf77a48dc6f43cb8be8bf1fb` |
| `C:/Users/Hoybos/.agents/bin/review-rubric.md` | `d3b52970017484ec591ae9df34b8ee88a440ef7ae43f11aa472436c2a7e2fa11` |
