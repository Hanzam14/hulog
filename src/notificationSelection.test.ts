import { describe, expect, it } from "vitest";
import {
  selectNotifications,
  type SelectionInput,
} from "../supabase/functions/_shared/selection";

const base = (): SelectionInput => ({
  now: new Date("2026-11-14T01:02:00.000Z"), // 09:02 in Manila
  groups: [{ id: "g1", owner_id: "a" }],
  memberships: [
    { group_id: "g1", user_id: "a", status: "active" },
    { group_id: "g1", user_id: "b", status: "active" },
  ],
  cycles: [
    {
      id: "c1",
      group_id: "g1",
      receiver_id: "b",
      status: "accepted",
      start_date: "2026-11-01",
      end_date: "2026-11-15",
    },
  ],
  progress: [],
  payments: [],
  prefs: [
    { user_id: "a", reminder_time: "08:00:00", enabled: true },
    { user_id: "b", reminder_time: "08:00:00", enabled: true },
  ],
  sent: [],
});

describe("Manila notification selection", () => {
  it.each([
    [
      "en",
      {
        reminder: ["Payment reminder", "Log today's payment for this round when you're ready."],
        confirm_payment: ["Confirm payment?", "A payment needs your review."],
        cycle_ends: ["Round ends tomorrow", "Your current round ends tomorrow."],
        payout_day: ["Payout day", "Today is payout day. Check in with each other."],
      },
    ],
    [
      "tl",
      {
        reminder: ["Paalala sa hulog", "Itala ang hulog mo para sa round na ito kapag handa ka na."],
        confirm_payment: ["Kumpirmahin ang hulog?", "May hulog na kailangan mong tingnan."],
        cycle_ends: ["Matatapos ang round bukas", "Bukas matatapos ang kasalukuyan ninyong round."],
        payout_day: ["Araw ng payout", "Araw ng payout ngayon. Magkumustahan kayo."],
      },
    ],
    [
      "taglish",
      {
        reminder: ["Hulog today", "Log today’s hulog when you’re ready."],
        confirm_payment: ["Confirm payment?", "A member logged a hulog that needs your review."],
        cycle_ends: ["Cycle ends tomorrow", "Your current hulog cycle ends tomorrow."],
        payout_day: ["Payout day", "Today is payout day. Check in with each other."],
      },
    ],
  ] as const)("uses %s for every notice kind", (language, expected) => {
    const input = base();
    input.prefs.forEach((pref) => (pref.language = language));
    input.payments = [
      {
        id: "recent-payment",
        cycle_id: "c1",
        member_id: "b",
        status: "pending",
        created_at: "2026-11-14T01:01:00.000Z",
        deleted_at: null,
      },
    ];
    const notices = selectNotifications(input);
    for (const kind of ["reminder", "confirm_payment", "cycle_ends"] as const) {
      const notice = notices.find((item) => item.kind === kind);
      expect([notice?.title, notice?.body]).toEqual(expected[kind]);
    }
    input.now = new Date("2026-11-16T01:02:00.000Z");
    const payout = selectNotifications(input).find(
      (item) => item.kind === "payout_day",
    );
    expect([payout?.title, payout?.body]).toEqual(expected.payout_day);
  });

  it("asks the other active member to confirm an owner's payment", () => {
    const input = base();
    input.payments = [
      {
        id: "owner-payment",
        cycle_id: "c1",
        member_id: "a",
        status: "pending",
        created_at: "2026-11-14T01:00:00.000Z",
        deleted_at: null,
      },
    ];
    expect(
      selectNotifications(input)
        .filter((n) => n.kind === "confirm_payment")
        .map((n) => [n.userId, n.refId]),
    ).toEqual([["b", "owner-payment"]]);
    input.memberships[1].status = "removed";
    expect(
      selectNotifications(input).filter((n) => n.kind === "confirm_payment"),
    ).toEqual([]);
  });
  it("selects morning cycle-end and payout notices at 09:00 Manila", () => {
    const input = base();
    expect(selectNotifications(input).map((notice) => notice.kind)).toEqual([
      "reminder",
      "reminder",
      "cycle_ends",
      "cycle_ends",
    ]);
    input.now = new Date("2026-11-16T01:02:00.000Z");
    expect(selectNotifications(input).map((notice) => notice.kind)).toEqual([
      "payout_day",
      "payout_day",
    ]);
  });

  it("does not remind on a pending proposal and counts pending payment days toward progress", () => {
    const input = base();
    input.cycles[0].status = "proposed";
    expect(
      selectNotifications(input).some((notice) => notice.kind === "reminder"),
    ).toBe(false);
    input.cycles[0].status = "accepted";
    input.progress = [
      { cycle_id: "c1", member_id: "b", confirmed_days: 0, pending_days: 14 },
    ];
    expect(
      selectNotifications(input)
        .filter((notice) => notice.kind === "reminder")
        .map((notice) => notice.userId),
    ).toEqual(["a"]);
  });

  it("selects a recent pending payment for the owner but ignores old or deleted rows", () => {
    const input = base();
    input.now = new Date("2026-11-14T09:00:00.000Z");
    input.payments = [
      {
        id: "p1",
        cycle_id: "c1",
        member_id: "b",
        status: "pending",
        created_at: "2026-11-14T08:55:00.000Z",
        deleted_at: null,
      },
      {
        id: "p2",
        cycle_id: "c1",
        member_id: "b",
        status: "pending",
        created_at: "2026-11-14T08:20:00.000Z",
        deleted_at: null,
      },
      {
        id: "p3",
        cycle_id: "c1",
        member_id: "b",
        status: "pending",
        created_at: "2026-11-14T08:55:00.000Z",
        deleted_at: "2026-11-14T08:58:00.000Z",
      },
    ];
    expect(
      selectNotifications(input)
        .filter((notice) => notice.kind === "confirm_payment")
        .map((notice) => notice.refId),
    ).toEqual(["p1"]);
  });

  it("deduplicates notifications for the same user, kind, reference, and Manila date", () => {
    const input = base();
    input.sent = [
      { user_id: "b", kind: "reminder", ref_id: "c1", sent_on: "2026-11-14" },
    ];
    const notices = selectNotifications(input);
    expect(
      notices.some(
        (notice) => notice.userId === "b" && notice.kind === "reminder",
      ),
    ).toBe(false);
    expect(notices.every((notice) => notice.sentOn === "2026-11-14")).toBe(
      true,
    );
  });

  it("sends no notification kinds to users who have disabled notifications", () => {
    const input = base();
    input.prefs[1].enabled = false;
    input.payments = [
      {
        id: "p1",
        cycle_id: "c1",
        member_id: "b",
        status: "pending",
        created_at: "2026-11-14T00:55:00.000Z",
        deleted_at: null,
      },
    ];
    const notices = selectNotifications(input);
    expect(notices.every((notice) => notice.userId !== "b")).toBe(true);
    expect(notices.some((notice) => notice.kind === "confirm_payment")).toBe(
      true,
    );
  });
});
