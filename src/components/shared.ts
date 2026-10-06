import type { Cycle, Snapshot } from "../data";

export type Run = (action: () => Promise<unknown>) => Promise<void>;
export interface ViewProps {
  data: Snapshot;
  user: string;
  run: Run;
  busy: boolean;
}
export const closed = (c: Cycle) =>
  c.phase === "settling" || c.phase === "ended";
export const name = (d: Snapshot, id: string) =>
  d.profiles.find((p) => p.id === id)?.display_name ?? "Member";
/** Each member keeps one sticker color: the group owner pink, the partner blue. */
export const tone = (d: Snapshot, id: string) =>
  id === d.groups[0]?.owner_id ? "pink" : "blue";
export const byNewest = (a: Cycle, b: Cycle) =>
  b.created_at.localeCompare(a.created_at);
