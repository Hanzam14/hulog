import type { Cycle, Snapshot } from "../data";

/** SPEC rule 8a: an open, unreceived round whose pot is full, for an active member. */
export function canCloseEarly(c: Cycle, data: Snapshot, user: string) {
  return (
    c.status === "accepted" &&
    c.phase === "open" &&
    !c.received_at &&
    c.target_centavos > 0 &&
    c.pot_centavos >= c.target_centavos &&
    data.memberships.some(
      (m) =>
        m.group_id === c.group_id &&
        m.user_id === user &&
        m.status === "active",
    )
  );
}
