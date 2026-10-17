import { afterEach, describe, expect, it, vi } from "vitest";

const result: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ order: () => ({ range: async () => result }) }),
    }),
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
  result.data = [];
  result.error = null;
});

describe("optionalRows", () => {
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
