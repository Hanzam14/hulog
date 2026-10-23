import { afterEach, describe, expect, it, vi } from "vitest";

const result: { data: unknown; error: unknown } = { data: [], error: null };
const hosted = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: hosted.rpc,
    from: (...args: unknown[]) => {
      hosted.from(...args);
      return {
        select: () => ({ order: () => ({ range: async () => result }) }),
      };
    },
  }),
}));

async function loadData() {
  vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  vi.resetModules();
  return import("./data");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  result.data = [];
  result.error = null;
});

describe("local solo dispatch", () => {
  it("loads the demo and records local proposals without querying Supabase", async () => {
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    const { load, rpc } = await loadData();
    const demo = await load();
    expect(demo.personalGoals?.some((g) => g.title === "AI Subscription")).toBe(
      true,
    );
    const cycleId = await rpc("propose_cycle", {
      p_daily_amount_centavos: 5000,
      p_num_days: 15,
      p_start_date: demo.today,
      p_is_solo: true,
    });
    const goalId = await rpc("propose_savings_goal", {
      p_title: "[Solo] Local only",
      p_goal_mode: "matched",
      p_start_date: demo.today,
      p_step_amount_centavos: 10000,
      p_cadence_days: 1,
      p_num_steps: 10,
      p_is_solo: true,
    });
    const saved = await load();
    expect(saved.cycles.find((c) => c.id === cycleId)).toMatchObject({
      is_solo: true,
      target_centavos: 75000,
    });
    expect(saved.personalGoals?.find((g) => g.id === goalId)).toMatchObject({
      target_amount_centavos: 100000,
    });
    expect(
      JSON.parse(store["hulog-solo-snapshot"]).cycles.some(
        (c: { id: string }) => c.id === cycleId,
      ),
    ).toBe(true);
    expect(hosted.from).not.toHaveBeenCalled();
    expect(hosted.rpc).not.toHaveBeenCalled();
  });
});

describe("optionalRows", () => {
  it("loads synced personal tables and sends personal writes to Supabase outside solo mode", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    hosted.rpc.mockResolvedValue({ data: "2026-10-21", error: null });
    const { load, rpc } = await loadData();
    const snapshot = await load();
    expect(hosted.from).toHaveBeenCalledWith("personal_savings_goals");
    expect(hosted.from).toHaveBeenCalledWith("personal_savings_entries");
    expect(hosted.from).toHaveBeenCalledWith("personal_savings_history");
    expect(hosted.from).toHaveBeenCalledWith("wishlist_items");
    expect(snapshot.personalGoals).toEqual([]);
    expect(snapshot.wishlistItems).toEqual([]);
    await rpc("create_personal_goal", {
      p_title: "Camera",
      p_target_amount_centavos: 10000,
    });
    expect(hosted.rpc).toHaveBeenLastCalledWith("create_personal_goal", {
      p_title: "Camera",
      p_target_amount_centavos: 10000,
    });
    await rpc("add_wishlist_item", {
      p_title: "Rice cooker",
      p_price_centavos: 250000,
    });
    expect(hosted.rpc).toHaveBeenLastCalledWith("add_wishlist_item", {
      p_title: "Rice cooker",
      p_price_centavos: 250000,
    });
  });
  it("returns rows when the query succeeds", async () => {
    const { optionalRows } = await loadData();
    result.data = [{ id: "w1" }];
    await expect(optionalRows("wallets", "id")).resolves.toEqual([
      { id: "w1" },
    ]);
  });

  it("returns [] when the v2 relation is not deployed yet", async () => {
    const { optionalRows } = await loadData();
    result.data = null;
    result.error = { message: "relation missing", code: "PGRST205" };
    await expect(optionalRows("abono_summary", "debtor_id")).resolves.toEqual(
      [],
    );
    result.error = { message: "relation missing", code: "42P01" };
    await expect(optionalRows("abono_summary", "debtor_id")).resolves.toEqual(
      [],
    );
  });

  it("rethrows other errors instead of showing empty balances", async () => {
    const { optionalRows } = await loadData();
    result.data = null;
    result.error = { message: "JWT expired", code: "PGRST301" };
    await expect(optionalRows("abono_summary", "debtor_id")).rejects.toThrow(
      "JWT expired",
    );
  });
});
