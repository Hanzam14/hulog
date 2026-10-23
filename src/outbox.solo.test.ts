import { afterEach, describe, expect, it, vi } from "vitest";
import { outboxItems, submitRecord } from "./outbox";
import { PROOF_REF_ERROR, PROOF_REF_LOCKED, editPaymentArgs } from "./proofRef";
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

  it("keeps the proof reference rules in the solo ledger", async () => {
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    const cycleId = await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 5000,
      p_num_days: 15,
      p_start_date: "2026-10-21",
      p_is_solo: true,
    });
    await expect(
      soloRpc("record_payment", {
        p_cycle_id: cycleId,
        p_days: 1,
        p_proof_ref: "ab#",
      }),
    ).rejects.toThrow(PROOF_REF_ERROR);
    const id = (await soloRpc("record_payment", {
      p_cycle_id: cycleId,
      p_days: 2,
      p_proof_ref: "  GC 1234-ABCD ",
    })) as string;
    const find = async () =>
      (await loadSoloSnapshot()).payments.find((p) => p.id === id)!;
    expect(await find()).toMatchObject({
      proof_ref: "GC 1234-ABCD",
      days: 2,
    });
    // Edits that send null for "leave as is" change nothing else.
    await soloRpc(
      "edit_payment",
      editPaymentArgs({ p_id: id }, "GC 1234-ABCD"),
    );
    expect(await find()).toMatchObject({ proof_ref: "GC 1234-ABCD", days: 2 });
    // Solo records are confirmed at once, so the reference is then locked.
    await expect(
      soloRpc("edit_payment", editPaymentArgs({ p_id: id }, "OTHER 9999")),
    ).rejects.toThrow(PROOF_REF_LOCKED);
    await expect(
      soloRpc("edit_payment", editPaymentArgs({ p_id: id }, "")),
    ).rejects.toThrow(PROOF_REF_LOCKED);
    expect((await find()).proof_ref).toBe("GC 1234-ABCD");
    const bare = (await soloRpc("record_payment", {
      p_cycle_id: cycleId,
      p_days: 1,
    })) as string;
    expect(
      (await loadSoloSnapshot()).payments.find((p) => p.id === bare)!.proof_ref,
    ).toBeNull();
  });
});
