import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sessionUser: { value: "u1" as string | null },
  solo: { value: false },
}));
vi.mock("./data", () => ({
  rpc: mocks.rpc,
  sessionUserId: async () => mocks.sessionUser.value,
}));
vi.mock("./solo", () => ({ isSoloMode: () => mocks.solo.value }));

const KEY_A = "11111111-1111-4111-8111-111111111111";
const payment = { p_cycle_id: "cycle-1", p_days: 2 };

function serverError(message: string, code = "P0001") {
  return Object.assign(new Error(message), { code });
}
function networkError() {
  return new Error("TypeError: Failed to fetch");
}
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  return store;
}
function stubNavigator(onLine: boolean, locks?: unknown) {
  vi.stubGlobal("navigator", { onLine, locks });
}
async function load() {
  vi.resetModules();
  return import("./outbox");
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.solo.value = false;
  mocks.sessionUser.value = "u1";
  stubStorage();
  stubNavigator(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitRecord", () => {
  it("sends online with the request key and does not queue", async () => {
    mocks.rpc.mockResolvedValue("payment-id");
    const { submitRecord, outboxItems } = await load();
    const result = await submitRecord("u1", {
      kind: "payment",
      args: payment,
      id: KEY_A,
    });
    expect(result).toEqual({ status: "sent", id: KEY_A, result: "payment-id" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_payment", {
      p_cycle_id: "cycle-1",
      p_days: 2,
      p_note: "",
      p_client_request_id: KEY_A,
    });
    expect(outboxItems("u1")).toEqual([]);
  });

  it("carries the proof reference only when there is one", async () => {
    mocks.rpc.mockResolvedValue("id");
    const { submitRecord, outboxItems } = await load();
    await submitRecord("u1", {
      kind: "payment",
      args: { ...payment, p_proof_ref: "  GC 1234-ABCD " },
      id: KEY_A,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("record_payment", {
      p_cycle_id: "cycle-1",
      p_days: 2,
      p_proof_ref: "GC 1234-ABCD",
      p_note: "",
      p_client_request_id: KEY_A,
    });
    // A blank reference is left out, so the server picks the original form.
    await submitRecord("u1", {
      kind: "payment",
      args: { ...payment, p_proof_ref: "   " },
      id: KEY_A,
    });
    expect(mocks.rpc.mock.lastCall?.[1]).not.toHaveProperty("p_proof_ref");
    await submitRecord("u1", {
      kind: "abono",
      args: { p_kind: "expense", p_proof_ref: "MAYA 9999" },
      id: KEY_A,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("record_abono_entry", {
      p_kind: "expense",
      p_proof_ref: "MAYA 9999",
      p_entry_date: null,
      p_note: "",
      p_client_request_id: KEY_A,
    });
    expect(outboxItems("u1")).toEqual([]);
  });

  it("keeps the reference on a queued record and sends it on retry", async () => {
    stubNavigator(false);
    const { submitRecord, outboxItems, flushOutbox } = await load();
    await submitRecord("u1", {
      kind: "payment",
      args: { ...payment, p_proof_ref: "GC 1234-ABCD" },
      id: KEY_A,
    });
    expect(outboxItems("u1")[0].args).toMatchObject({
      p_proof_ref: "GC 1234-ABCD",
    });
    stubNavigator(true);
    mocks.rpc.mockResolvedValue("payment-id");
    await flushOutbox("u1");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_payment",
      expect.objectContaining({
        p_proof_ref: "GC 1234-ABCD",
        p_client_request_id: KEY_A,
      }),
    );
  });

  it("queues without calling the server while the browser is offline", async () => {
    stubNavigator(false);
    const { submitRecord, outboxItems } = await load();
    const result = await submitRecord("u1", {
      kind: "payment",
      args: payment,
      id: KEY_A,
    });
    expect(result).toEqual({ status: "queued", id: KEY_A });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(outboxItems("u1")).toMatchObject([
      { id: KEY_A, kind: "payment", state: "queued", args: payment },
    ]);
  });

  it("queues when the call fails with a network error", async () => {
    mocks.rpc.mockRejectedValue(networkError());
    const { submitRecord, outboxItems } = await load();
    const result = await submitRecord("u1", {
      kind: "abono",
      args: { p_kind: "expense" },
      id: KEY_A,
    });
    expect(result.status).toBe("queued");
    expect(outboxItems("u1")).toHaveLength(1);
  });

  it("never queues a server rule error; it is thrown to the caller", async () => {
    mocks.rpc.mockRejectedValue(
      serverError("Payment days exceed cap or are invalid"),
    );
    const { submitRecord, outboxItems } = await load();
    await expect(
      submitRecord("u1", { kind: "payment", args: payment }),
    ).rejects.toThrow("Payment days exceed cap or are invalid");
    expect(outboxItems("u1")).toEqual([]);
  });

  it("does not queue an unrelated error that is not a network failure", async () => {
    mocks.rpc.mockRejectedValue(new RangeError("bad input"));
    const { submitRecord, outboxItems } = await load();
    await expect(
      submitRecord("u1", { kind: "payment", args: payment }),
    ).rejects.toThrow("bad input");
    expect(outboxItems("u1")).toEqual([]);
  });

  it("queues the same key only once when the user taps twice offline", async () => {
    stubNavigator(false);
    const { submitRecord, outboxItems } = await load();
    await submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    await submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    expect(outboxItems("u1")).toHaveLength(1);
  });

  it("generates a distinct uuid per attempt when no key is given", async () => {
    mocks.rpc.mockResolvedValue("id");
    const { submitRecord, newRequestId } = await load();
    const a = await submitRecord("u1", { kind: "payment", args: payment });
    const b = await submitRecord("u1", { kind: "payment", args: payment });
    expect(a.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(a.id).not.toBe(b.id);
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
    });
    const { newRequestId } = await load();
    expect(newRequestId()).toBe("07070707-0707-4707-8707-070707070707");
  });

  it("bypasses the outbox in solo mode, even offline", async () => {
    mocks.solo.value = true;
    stubNavigator(false);
    mocks.rpc.mockResolvedValue("local-id");
    const { submitRecord, outboxItems, flushOutbox } = await load();
    const result = await submitRecord("solo-user", {
      kind: "payment",
      args: payment,
      id: KEY_A,
    });
    expect(result).toMatchObject({ status: "sent", result: "local-id" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(outboxItems("solo-user")).toEqual([]);
    mocks.rpc.mockClear();
    expect(await flushOutbox("solo-user")).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("always sends the optional arguments the keyed abono call needs", async () => {
    mocks.rpc.mockResolvedValue("entry-id");
    const { submitRecord } = await load();
    await submitRecord("u1", {
      kind: "abono",
      args: { p_kind: "expense", p_description: "Groceries" },
      id: KEY_A,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("record_abono_entry", {
      p_kind: "expense",
      p_description: "Groceries",
      p_entry_date: null,
      p_note: "",
      p_client_request_id: KEY_A,
    });
  });
});

describe("flushOutbox", () => {
  async function queueTwo() {
    stubNavigator(false);
    const mod = await load();
    await mod.submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    await mod.submitRecord("u1", {
      kind: "abono",
      args: { p_kind: "expense" },
      id: "22222222-2222-4222-8222-222222222222",
    });
    stubNavigator(true);
    return mod;
  }

  it("sends oldest first with each item's original key and removes it on success", async () => {
    const mod = await queueTwo();
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 2, failed: 0 });
    expect(
      mocks.rpc.mock.calls.map((c) => [c[0], c[1].p_client_request_id]),
    ).toEqual([
      ["record_payment", KEY_A],
      ["record_abono_entry", "22222222-2222-4222-8222-222222222222"],
    ]);
    expect(mod.outboxItems("u1")).toEqual([]);
  });

  it("reuses the same key on every retry after a network error", async () => {
    const mod = await queueTwo();
    mocks.rpc.mockRejectedValue(networkError());
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    // The first network error stops the run, and both items stay queued.
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mod.outboxItems("u1").map((i) => i.state)).toEqual([
      "queued",
      "queued",
    ]);
    mocks.rpc.mockResolvedValue("ok");
    await mod.flushOutbox("u1");
    const keys = mocks.rpc.mock.calls.map((c) => c[1].p_client_request_id);
    expect(keys[0]).toBe(KEY_A);
    expect(keys[1]).toBe(KEY_A);
    expect(mod.outboxItems("u1")).toEqual([]);
  });

  it("keeps a rule error as failed, never retries it, and continues with the rest", async () => {
    const mod = await queueTwo();
    mocks.rpc
      .mockRejectedValueOnce(serverError("Payment window closed"))
      .mockResolvedValueOnce("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 1 });
    expect(mod.outboxItems("u1")).toMatchObject([
      { id: KEY_A, state: "failed", error: "Payment window closed" },
    ]);
    mocks.rpc.mockClear();
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mod.discardItem("u1", KEY_A);
    expect(mod.outboxItems("u1")).toEqual([]);
  });

  it("treats an expired-session error as retryable, not as a rule failure", async () => {
    const mod = await queueTwo();
    mocks.rpc.mockRejectedValue(serverError("JWT expired", "PGRST301"));
    await mod.flushOutbox("u1");
    expect(mod.outboxItems("u1").map((i) => i.state)).toEqual([
      "queued",
      "queued",
    ]);
  });

  it.each(["PGRST002", "57014", "40001", "08006", "53300", "42501"])(
    "treats temporary server code %s as retryable, not a rule failure",
    async (code) => {
      const mod = await queueTwo();
      mocks.rpc.mockRejectedValue(serverError("temporary", code));
      expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
      expect(mod.outboxItems("u1").map((i) => i.state)).toEqual([
        "queued",
        "queued",
      ]);
    },
  );

  it("sends nothing when the live session is not the queue owner", async () => {
    const mod = await queueTwo();
    mocks.sessionUser.value = "someone-else";
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    mocks.sessionUser.value = null;
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mod.outboxItems("u1").map((i) => i.state)).toEqual([
      "queued",
      "queued",
    ]);
  });

  it("retryItem puts a failed item back in the queue with the same key", async () => {
    const mod = await queueTwo();
    mocks.rpc
      .mockRejectedValueOnce(serverError("Payment window closed"))
      .mockResolvedValueOnce("ok");
    await mod.flushOutbox("u1");
    mod.retryItem("u1", KEY_A);
    expect(mod.outboxItems("u1")).toMatchObject([
      { id: KEY_A, state: "queued" },
    ]);
    expect(mod.outboxItems("u1")[0]).not.toHaveProperty("error");
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 0 });
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_client_request_id).toBe(KEY_A);
  });

  it("does nothing while offline", async () => {
    const mod = await queueTwo();
    stubNavigator(false);
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mod.outboxItems("u1")).toHaveLength(2);
  });

  it("is single-flight: a second flush while one runs sends nothing", async () => {
    const mod = await queueTwo();
    let release!: () => void;
    mocks.rpc.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve("ok"))),
    );
    const first = mod.flushOutbox("u1");
    const second = await mod.flushOutbox("u1");
    expect(second).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue("ok");
    release();
    expect(await first).toEqual({ sent: 2, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("uses navigator.locks when available and skips when another tab holds it", async () => {
    stubNavigator(false);
    const mod = await load();
    await mod.submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    const held = vi.fn(
      async (_n: string, _o: unknown, cb: (l: unknown) => Promise<unknown>) =>
        cb(null),
    );
    stubNavigator(true, { request: held });
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 0, failed: 0 });
    expect(held).toHaveBeenCalledWith(
      "hulog-outbox-flush",
      { ifAvailable: true },
      expect.any(Function),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    const free = vi.fn(
      async (_n: string, _o: unknown, cb: (l: unknown) => Promise<unknown>) =>
        cb({}),
    );
    stubNavigator(true, { request: free });
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 0 });
  });

  it("recovers an item left as sending by a closed tab", async () => {
    const store = stubStorage();
    store.set(
      "hulog-outbox:u1",
      JSON.stringify([
        {
          id: KEY_A,
          kind: "payment",
          args: payment,
          createdAt: "2026-10-23T00:00:00.000Z",
          state: "sending",
        },
      ]),
    );
    const mod = await load();
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 0 });
    expect(mocks.rpc.mock.calls[0][1].p_client_request_id).toBe(KEY_A);
  });
});

describe("isolation and storage", () => {
  it("never sends another user's queue", async () => {
    stubNavigator(false);
    const mod = await load();
    await mod.submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    stubNavigator(true);
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u2")).toEqual({ sent: 0, failed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mod.outboxItems("u2")).toEqual([]);
    expect(mod.outboxItems("u1")).toHaveLength(1);
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 0 });
  });

  it("persists per user in localStorage and survives a reload", async () => {
    stubNavigator(false);
    const store = stubStorage();
    const first = await load();
    await first.submitRecord("u1", {
      kind: "payment",
      args: payment,
      id: KEY_A,
    });
    expect(JSON.parse(store.get("hulog-outbox:u1")!)).toHaveLength(1);
    expect(store.has("hulog-outbox:u2")).toBe(false);
    const second = await load();
    expect(second.outboxItems("u1")).toMatchObject([{ id: KEY_A }]);
  });

  it("does not crash when storage throws; the session still queues and sends", async () => {
    const boom = () => {
      throw new Error("storage disabled");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    stubNavigator(false);
    const mod = await load();
    await expect(
      mod.submitRecord("u1", { kind: "payment", args: payment, id: KEY_A }),
    ).resolves.toMatchObject({ status: "queued" });
    expect(mod.outboxItems("u1")).toHaveLength(1);
    stubNavigator(true);
    mocks.rpc.mockResolvedValue("ok");
    expect(await mod.flushOutbox("u1")).toEqual({ sent: 1, failed: 0 });
    expect(mod.outboxItems("u1")).toEqual([]);
  });

  it("ignores corrupt stored data", async () => {
    const store = stubStorage();
    store.set("hulog-outbox:u1", "{not json");
    store.set("hulog-outbox:u2", JSON.stringify([{ id: 5 }, null, "x"]));
    const mod = await load();
    expect(mod.outboxItems("u1")).toEqual([]);
    expect(mod.outboxItems("u2")).toEqual([]);
  });

  it("returns the same snapshot until the queue changes", async () => {
    stubNavigator(false);
    const mod = await load();
    const empty = mod.outboxItems("u1");
    expect(mod.outboxItems("u1")).toBe(empty);
    await mod.submitRecord("u1", { kind: "payment", args: payment, id: KEY_A });
    expect(mod.outboxItems("u1")).not.toBe(empty);
  });
});

describe("isNetworkError", () => {
  it("separates network failures from server verdicts", async () => {
    const { isNetworkError } = await load();
    expect(isNetworkError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("anything"))).toBe(true);
    expect(isNetworkError(serverError("Payment window closed"))).toBe(false);
    expect(
      isNetworkError(
        Object.assign(new Error("Failed to fetch"), { code: "42501" }),
      ),
    ).toBe(false);
    expect(isNetworkError(new Error("bad input"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
