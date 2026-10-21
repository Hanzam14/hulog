import { describe, expect, it, vi } from "vitest";
import type { Cycle, Snapshot } from "../data";
import { canCloseEarly } from "./closeEarlyRule";

vi.mock("../data", () => ({ rpc: vi.fn().mockResolvedValue(undefined) }));

const cycle = (patch: Partial<Cycle> = {}): Cycle => ({
  id: "c1",
  group_id: "group",
  daily_amount_centavos: 10000,
  num_days: 10,
  start_date: "2026-10-10",
  end_date: "2026-10-19",
  receiver_id: "a",
  proposed_by: "b",
  status: "accepted",
  phase: "open",
  pot_centavos: 200000,
  target_centavos: 200000,
  payout_state: null,
  received_at: null,
  days_left: 5,
  created_at: "2026-10-09",
  ...patch,
});

const snapshot = (
  status: "pending" | "active" | "denied" | "removed" = "active",
): Snapshot =>
  ({
    memberships: [
      { group_id: "group", user_id: "a", status, last_seen_history_at: "" },
      {
        group_id: "group",
        user_id: "b",
        status: "active",
        last_seen_history_at: "",
      },
    ],
  }) as unknown as Snapshot;

describe("canCloseEarly", () => {
  it("is true for an open accepted round with a full pot and an active member", () => {
    expect(canCloseEarly(cycle(), snapshot(), "a")).toBe(true);
    expect(
      canCloseEarly(cycle({ pot_centavos: 250000 }), snapshot(), "b"),
    ).toBe(true);
  });

  it("is false while the pot is short", () => {
    expect(
      canCloseEarly(cycle({ pot_centavos: 199999 }), snapshot(), "a"),
    ).toBe(false);
  });

  it("is false when the round is upcoming or settling", () => {
    expect(canCloseEarly(cycle({ phase: "upcoming" }), snapshot(), "a")).toBe(
      false,
    );
    expect(canCloseEarly(cycle({ phase: "settling" }), snapshot(), "a")).toBe(
      false,
    );
  });

  it("is false once the receiver already got the pot", () => {
    expect(
      canCloseEarly(
        cycle({ received_at: "2026-10-15T00:00:00Z" }),
        snapshot(),
        "a",
      ),
    ).toBe(false);
  });

  it("is false when the round is not accepted", () => {
    expect(canCloseEarly(cycle({ status: "proposed" }), snapshot(), "a")).toBe(
      false,
    );
  });

  it("is false for someone who is not an active member", () => {
    expect(canCloseEarly(cycle(), snapshot(), "stranger")).toBe(false);
    expect(canCloseEarly(cycle(), snapshot("removed"), "a")).toBe(false);
    expect(canCloseEarly(cycle(), snapshot("pending"), "a")).toBe(false);
  });
});
