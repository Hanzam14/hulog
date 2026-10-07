import type { Cycle, Snapshot } from "../data";
import { t } from "../i18n";

export type Run = (
  action: () => Promise<unknown>,
  options?: { showSuccess?: boolean },
) => Promise<void>;
export interface ViewProps {
  data: Snapshot;
  user: string;
  run: Run;
  busy: boolean;
}
export const closed = (c: Cycle) =>
  c.phase === "settling" || c.phase === "ended";
export const palette = ["pink", "blue", "green", "orange", "purple"] as const;
export type Tone = (typeof palette)[number];
export const emojis = [
  "🐷",
  "🐱",
  "🐶",
  "🐰",
  "🐻",
  "🐼",
  "🐸",
  "🐵",
  "🦊",
  "🐥",
  "🌻",
  "🌸",
  "🍓",
  "🥭",
  "⭐",
  "🌙",
] as const;
export const name = (d: Snapshot, id: string) => {
  const profile = d.profiles.find((p) => p.id === id);
  return profile?.nickname ?? profile?.display_name ?? t("Member");
};
/** Owner keeps a colliding color; partner gets the first unused palette color. */
export const tone = (d: Snapshot, id: string): Tone => {
  const owner = d.groups[0]?.owner_id;
  const chosen = (who: string | undefined): Tone => {
    const color = d.profiles.find((p) => p.id === who)?.color;
    return color && color !== "auto" ? color : who === owner ? "pink" : "blue";
  };
  const ownerColor = chosen(owner);
  const color = chosen(id);
  return id !== owner && color === ownerColor
    ? palette.find((value) => value !== ownerColor)!
    : color;
};
export const byNewest = (a: Cycle, b: Cycle) =>
  b.created_at.localeCompare(a.created_at);
