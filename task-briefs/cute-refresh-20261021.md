# Hulog cute refresh ("deslopify"), 2026-10-21

Lead: Claude Opus (design spec + review). Builder: Sol. Owner asked: make Hulog look better and cuter, remove the generic/AI-made look.

## Where to work

- Worktree: `C:\Projects\Hulog-wt-cute`, branch `design/cute-refresh`. Work only there.
- First, fix the base: the worktree was cut from `main` (`f117e7a`), but `C:\Projects\Hulog` has newer commits
  (`6c382e9` solo mode, `cf32c85` solo goals). Run `git -C C:\Projects\Hulog branch -vv` and find the branch holding them.
  If they are not on `main`, `git reset --hard <that branch>` inside the worktree (the design branch has no work yet, so this
  is safe) and say so in the report. Do not touch `C:\Projects\Hulog` itself (its untracked `task-briefs/` is the owner's).
- Read `AGENTS.md`, `docs/SPEC.md` (skim for screens), `src/style.css`, `src/theme.ts`, `index.html`, and the screens/components.
- Rules: no new dependencies, no edits to `supabase/`, auth/sign-in logic, `src/data.ts`, `src/solo.ts` logic, push backend,
  `.env`, settings. Presentation only (CSS, markup/classNames, icons from the existing `@tabler/icons-react`, `public/` icons).
  Any new or changed user-facing string goes in `src/i18n.ts` in English, Tagalog and Taglish. Keep 360px usability,
  44px tap targets, light + dark themes, Taglish voice. Do not push, merge, deploy. Commit on the branch when checks pass.

## Design direction: "ube sticker pad"

Keep the existing concept (a shared sticker planner where each day you paid gets a sticker) — it is good. Make it
cuter and more coherent, and strip the generic tells.

### Tokens (replace the `:root` / dark blocks in `src/style.css`; keep variable names where code uses them, add new ones as needed)

Light:
- `--paper` `#F5EFFF` (ube milk) with dot grid `--dots` `#E2D6FA`
- `--ink` `#2B2140` (deep ube; text, outlines) ; `--soft` `#6B5E85` (secondary text, must pass 4.5:1 on paper and card)
- `--card` `#FFFFFF` ; `--card-tint` `#FBF8FF`
- Member A pink `--pink` `#FF7AA2` / `--pink-deep` `#C2386A`; member B sky `--blue` `#5DBBFF` / `--blue-deep` `#1C6BA5`
- `--mango` `#FFC94D` / `--mango-deep` `#A86A00` (coins, pot, celebration, highlights; replaces orange/highlight roles)
- `--leaf` `#3DBE84` / `--leaf-deep` `#1F7A50` (success/confirmed); `--danger` `#C0362C`
Dark ("ube night"): paper `#1B1526`, dots `#2C2340`, card `#251D35`, card-tint `#2D2440`, ink `#F4EEFF`, soft `#B9ACD6`,
member/accent colors slightly lifted for contrast. Update `theme.ts` + `index.html` theme-color to the new paper colors.
Check every text/background pair with a contrast calc (≥4.5:1 body, ≥3:1 large text and UI outlines); list results.

### Type
Keep Fredoka (display, 600) and Nunito (body). Set one scale and use it everywhere: 13 / 15 / 17 / 20 / 26 / 34px,
body 15–16px line-height 1.5, headings 1.15–1.25. Amounts (₱) in Fredoka with tabular numbers. Sentence case everywhere.

### Shape, depth, spacing (the coherence fix)
- Radius hierarchy, not one radius on everything: sheets/main cards 22px, inner rows 14px, inputs 12px, chips/pills 999px,
  sticker dots full circle.
- One depth style, used sparingly: "sticker lift" = `2px 3px 0 var(--ink)` outline-offset shadow, only on primary buttons,
  the tally card and the pot. Everything else is flat with a 1.5px `--ink`-at-low-opacity line or tint fill, no grey
  blur shadows, no gradient washes.
- Spacing scale 4/8/12/16/24/32 only; one consistent page gutter (16px at 360–414px).

### The one bold thing: coin stickers
Make the daily sticker dots read as little peso-coin stickers: filled circle in the member color, a thin darker rim, a tiny
highlight arc (CSS radial-gradient or pseudo-element), and a very slight per-index rotation (−6°…6°, deterministic by index).
Empty slots: dashed ring in `--soft` at low opacity. Pending/unconfirmed: dashed ring in member color. The pot/payout
moment uses `--mango` coins. When a sticker is newly added, one short "stamp" scale animation (≤250ms), disabled under
`prefers-reduced-motion`. Keep everything else calm — no hover effects on every card, no scattered entrance animations.

### Strip these tells wherever they appear (search the whole `src/`)
- ALL-CAPS / letter-spaced labels; eyebrow labels above headings that add nothing.
- Meta strings joined with " · " — use separate elements or plain words.
- Arrows ("→", "›") appended to button/link text (icons are fine when they mean navigation, as a separate element).
- Emoji used as UI icons — replace with matching `@tabler/icons-react` icons (emoji inside user content or the confetti
  celebration copy may stay).
- Identical bordered card around every block; mixed one-off shadows/radii/colors not from tokens. Hard-coded hex colors
  outside the token blocks → tokens.
- Vague or salesy copy in buttons: CTAs say what happens ("I-record ang hulog", not "Submit"). Only touch copy that is
  clearly generic; keep the owner's Taglish voice and keep i18n triples complete.

### Screens to cover
Sign-in/landing, NoGroup, Home (tally, cycle card, custody, ipon card), Record, RecordIpon, Propose, ProposeIpon, Detail,
IponDetail, Tracker, History, Changes, Settings (all sub-sections), update banner, celebration toast. Use the solo mode
("Mag-solo muna sa device na ito") to reach inner screens without Google sign-in.

## Verification and evidence

1. `npm run lint`, `npm test`, `npm run build` — all must pass (baseline before your changes too; report both).
2. Run the dev server and capture before/after screenshots at 375px, light and dark, for at least: landing, Home, Record,
   Tracker, IponDetail, Settings. Use whatever browser tooling you have without installing new project dependencies; save
   PNGs to `C:\Projects\Hulog-wt-cute\design-shots\` (add that folder to `.git/info/exclude`, do not commit it). If you
   cannot capture screenshots, say so plainly.
3. Check 360px for horizontal overflow on every screen above.
4. Report: changed files, the contrast table, tells removed (file:line before), screenshots list, check results,
   anything you saw but did not fix, and the commit hash.
