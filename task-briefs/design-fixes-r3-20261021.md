# Hulog round 3: design fixes from Opus screenshot review, 2026-10-21

Worktree `C:\Projects\Hulog-wt-cute`, branch `design/cute-refresh` (HEAD `cec176d`). Same rules as
`task-briefs/cute-refresh-20261021.md` (presentation only this round: no `supabase/`, no data/RPC logic changes; i18n
triples for every string; 360px; light+dark; 44px tap targets; no push/merge/deploy). Commit when checks pass.
Reuse the screenshot tooling Sol used in rounds 1–2 (see `docs/CUTE_REFRESH_REPORT.md` / `docs/PERSONAL_SAVINGS_REPORT.md`);
no new project dependencies.

## Fixes (all in one round)

1. Coin stickers are the signature and are too small. Make them 26–28px at 375px, fit a 15-day cycle on one row when
   it fits (else wrap evenly, e.g. 8+7), keep the ₱ glyph legible (hide it below 22px). Remove the large "I" avatar
   circle that eats the row; show the member name/avatar small above the row instead.
2. Home mode switch "Partnered Pot (may Solo at Shared goals)" / "Standalone Solo": short labels "Kami" / "Solo"
   (en: "Together" / "Solo"), no parentheses.
3. "Nasaan ang pera natin": replace the pill with parenthetical breakdown ("Main Pot: ₱900.00 (Paluwagan: … Ipon: …)")
   with a plain two-level list: wallet row, then indented Paluwagan / Ipon amounts.
4. Pill overload: on ipon cards keep at most ONE status chip; turn meta pills ("Hawak ni Ikaw (Main Pot)",
   "Flexible kahit kailan", "₱0, Nakatunghay") into plain secondary text lines. Fix grammar "Hawak ni Ikaw" → "Hawak mo"
   (and partner: "Hawak ni <name>"). "Solo, Ikaw (Kita ng partner)" → "Sarili mo · nakikita ni <partner>" is NOT allowed
   (no middle-dot meta strings): use "Sariling goal" chip + a separate line "Nakikita ni <partner>".
5. "Mag-ipon" small orphan button next to "Bagong ipon goal": move "Mag-ipon" into each goal card as its primary action;
   keep one "Bagong ipon goal" button below the list.
6. Primary CTA label must be identical in light and dark ("I-record ang hulog"); the dark screenshot showed "+ hulog".
   Find why and fix.
7. Personal savings section (round 2): owner's own shared goal must say "Nakikita ni <partner>" (not "Shared, tingin
   lang", which is the partner's viewpoint; keep "Tingin lang" only on the partner's read-only view). Put the
   private/shared badge in the same position on every card (top-right of the title row). Shorten the two record buttons
   to "Dagdag" / "Bawas" with plus/minus icons so they stay on one line at 360px.
8. Tracker (Abono): merge the three separate bordered cards (status, add button, empty state) into one sheet; remove the
   text "✓" after "Walang utang ang bawat isa" (icon already there); "+ Magdagdag…" uses an icon, not a literal "+".
9. Record screen: the lone tiny coin at the left looks orphaned. Show the coins being recorded centered under the
   stepper at sticker size (1–N coins, wrap evenly), with the stamp animation on increment (reduced-motion respected).
10. Settings: disabled buttons get no sticker-lift shadow and a clearly disabled style; "I-archive ang wallet" becomes a
    normal small icon+text button aligned on the wallet row (not stacked red underlined text); make sure text links used
    as secondary actions (e.g. "Baguhin ang hulog", "Hilinging alisin", "Ilipat ang ipon…") have ≥44px hit areas.
11. Bottom tab bar: ensure page content has bottom padding equal to the bar height + safe-area inset so nothing hides
    behind it at the end of a page.
12. PWA manifest theme/background colors and `public/` icons to the new palette (keep the existing icon shape; recolor).

## Evidence

lint/test/build before and after; screenshots at 375px light+dark into `design-shots/` named `r3-<screen>-<theme>.png`
for: landing, home (together + solo), record, tracker, ipondetail, personal savings (private + shared, owner view and
partner view), settings (light AND dark). Report changed files, each fix number with file:line, check results, commit hash.
