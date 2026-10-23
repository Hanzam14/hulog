import { afterEach, describe, expect, it, vi } from "vitest";
import { outboxItems, submitRecord } from "./outbox";
import { loadSoloSnapshot, soloRpc } from "./solo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solo mode and the outbox", () => {
  it("accepts and ignores the request key, never queues, even offline", async () => {
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    vi.stubGlobal("navigator", { onLine: false });
    const cycleId = await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 5000,
      p_num_days: 15,
      p_start_date: "2026-10-21",
      p_is_solo: true,
    });
    const key = "33333333-3333-4333-8333-333333333333";
    const first = await submitRecord("solo-user", {
      kind: "payment",
      args: { p_cycle_id: cycleId, p_days: 2 },
      id: key,
    });
    expect(first.status).toBe("sent");
    // The local ledger has no retries to dedupe: a second call is a second record.
    await submitRecord("solo-user", {
      kind: "payment",
      args: { p_cycle_id: cycleId, p_days: 1 },
      id: key,
    });
    const snapshot = await loadSoloSnapshot();
    expect(snapshot.payments.map((p) => p.days).slice(-2)).toEqual([2, 1]);
    expect(outboxItems("solo-user")).toEqual([]);
    expect(Object.keys(store).some((k) => k.startsWith("hulog-outbox:"))).toBe(
      false,
    );
  });
});
