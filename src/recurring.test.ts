import { afterEach, describe, expect, it, vi } from "vitest";
import type { AbonoEntry } from "./data";
import {
  dismissSuggestion,
  medianCentavos,
  normalizeDescription,
  readDismissed,
  recurringSuggestions,
  scaleShare,
} from "./recurring";

const me = "me";
const partner = "partner";
const today = "2026-10-23";

let counter = 0;
const entry = (over: Partial<AbonoEntry> = {}): AbonoEntry => {
  counter += 1;
  return {
    id: `e${counter}`,
    group_id: "g",
    kind: "expense",
    from_member: me,
    to_member: partner,
    description: "Kuryente",
    total_amount_centavos: 245000,
    owed_amount_centavos: 122500,
    entry_date: "2026-09-05",
    note: "",
    status: "confirmed",
    was_confirmed: true,
    created_by: me,
    last_edited_by: null,
    delete_proposed_by: null,
    created_at: "2026-09-05T02:00:00Z",
    confirmed_by: partner,
    confirmed_at: "2026-09-05T03:00:00Z",
    edited_at: null,
    deleted_at: null,
    ...over,
  };
};
/** Kuryente in August and September: the smallest thing that recurs. */
const twoMonths = (over: Partial<AbonoEntry> = {}) => [
  entry({ entry_date: "2026-08-04", ...over }),
  entry({ entry_date: "2026-09-05", ...over }),
];

afterEach(() => vi.unstubAllGlobals());

describe("normalizeDescription", () => {
  it("trims, case-folds and collapses spaces", () => {
    expect(normalizeDescription("  KURYENTE   Bill ")).toBe("kuryente bill");
    expect(normalizeDescription("Kuryente\t bill")).toBe("kuryente bill");
  });
});

describe("recurringSuggestions", () => {
  it("suggests a bill seen in two of the last three months", () => {
    const [s] = recurringSuggestions(twoMonths(), today);
    expect(s).toMatchObject({
      description: "Kuryente",
      payerId: me,
      totalCentavos: 245000,
      owedCentavos: 122500,
      monthsSeen: 2,
    });
  });

  it("matches spelling variants but not other payers or other bills", () => {
    const variants = [
      entry({ entry_date: "2026-08-04", description: "  kuryente " }),
      entry({ entry_date: "2026-09-05", description: "KURYENTE" }),
    ];
    expect(recurringSuggestions(variants, today)).toHaveLength(1);

    // Same words, different payer: two single sightings, not one recurring bill.
    const split = [
      entry({ entry_date: "2026-08-04" }),
      entry({ entry_date: "2026-09-05", from_member: partner, to_member: me }),
    ];
    expect(recurringSuggestions(split, today)).toHaveLength(0);

    const other = [
      entry({ entry_date: "2026-08-04" }),
      entry({ entry_date: "2026-09-05", description: "Tubig" }),
    ];
    expect(recurringSuggestions(other, today)).toHaveLength(0);
  });

  it("needs two different months, not two entries in one month", () => {
    const sameMonth = [
      entry({ entry_date: "2026-09-02" }),
      entry({ entry_date: "2026-09-20" }),
    ];
    expect(recurringSuggestions(sameMonth, today)).toHaveLength(0);
  });

  it("only looks at the three Manila months before the current one", () => {
    // June is outside the window (July, August, September), so only one month counts.
    const old = [
      entry({ entry_date: "2026-06-30" }),
      entry({ entry_date: "2026-09-05" }),
    ];
    expect(recurringSuggestions(old, today)).toHaveLength(0);
    // July and September are both inside it.
    const edge = [
      entry({ entry_date: "2026-07-01" }),
      entry({ entry_date: "2026-09-05" }),
    ];
    expect(recurringSuggestions(edge, today)).toHaveLength(1);
    // The current month never counts as a past sighting.
    const thisMonth = [
      entry({ entry_date: "2026-09-05" }),
      entry({ entry_date: "2026-10-02" }),
    ];
    expect(recurringSuggestions(thisMonth, today)).toHaveLength(0);
  });

  it("follows the Manila month across a year boundary", () => {
    const jan = recurringSuggestions(
      [
        entry({ entry_date: "2026-11-05" }),
        entry({ entry_date: "2026-12-05" }),
      ],
      "2027-01-10",
    );
    expect(jan).toHaveLength(1);
    expect(
      recurringSuggestions(
        [
          entry({ entry_date: "2026-09-05" }),
          entry({ entry_date: "2026-12-05" }),
        ],
        "2027-01-10",
      ),
    ).toHaveLength(0);
  });

  it("drops a bill already recorded this month, pending included, but not a deleted one", () => {
    expect(
      recurringSuggestions(
        [...twoMonths(), entry({ entry_date: "2026-10-03" })],
        today,
      ),
    ).toHaveLength(0);
    expect(
      recurringSuggestions(
        [
          ...twoMonths(),
          entry({ entry_date: "2026-10-03", status: "pending" }),
        ],
        today,
      ),
    ).toHaveLength(0);
    expect(
      recurringSuggestions(
        [
          ...twoMonths(),
          entry({
            entry_date: "2026-10-03",
            deleted_at: "2026-10-04T00:00:00Z",
          }),
        ],
        today,
      ),
    ).toHaveLength(1);
    // Recorded by the other payer is a different bill, so it does not hide ours.
    expect(
      recurringSuggestions(
        [
          ...twoMonths(),
          entry({ entry_date: "2026-10-03", from_member: partner }),
        ],
        today,
      ),
    ).toHaveLength(1);
  });

  it("ignores pending, deleted and settlement entries as past sightings", () => {
    const notCounted = [
      entry({ entry_date: "2026-08-04" }),
      entry({ entry_date: "2026-09-05", status: "pending" }),
      entry({ entry_date: "2026-07-05", deleted_at: "2026-07-06T00:00:00Z" }),
      entry({ entry_date: "2026-07-06", kind: "settlement" }),
    ];
    expect(recurringSuggestions(notCounted, today)).toHaveLength(0);
  });

  it("uses the median amount of the past occurrences", () => {
    const odd = [
      entry({ entry_date: "2026-07-05", total_amount_centavos: 200000 }),
      entry({ entry_date: "2026-08-05", total_amount_centavos: 300000 }),
      entry({ entry_date: "2026-09-05", total_amount_centavos: 250000 }),
    ];
    expect(recurringSuggestions(odd, today)[0].totalCentavos).toBe(250000);
    // One bad month does not drag a median the way it would an average.
    const spike = [
      entry({ entry_date: "2026-07-05", total_amount_centavos: 200000 }),
      entry({ entry_date: "2026-08-05", total_amount_centavos: 210000 }),
      entry({ entry_date: "2026-09-05", total_amount_centavos: 900000 }),
    ];
    expect(recurringSuggestions(spike, today)[0].totalCentavos).toBe(210000);
    const even = [
      entry({ entry_date: "2026-08-05", total_amount_centavos: 100001 }),
      entry({ entry_date: "2026-09-05", total_amount_centavos: 100002 }),
    ];
    expect(recurringSuggestions(even, today)[0].totalCentavos).toBe(100002);
  });

  it("pre-fills the latest split, scaled to the median total", () => {
    const [s] = recurringSuggestions(
      [
        entry({
          entry_date: "2026-08-05",
          total_amount_centavos: 100000,
          owed_amount_centavos: 100000,
        }),
        entry({
          entry_date: "2026-09-05",
          total_amount_centavos: 100000,
          owed_amount_centavos: 25000,
        }),
      ],
      today,
    );
    expect(s.totalCentavos).toBe(100000);
    expect(s.owedCentavos).toBe(25000);
  });

  it("pre-fills a past all-mine split as 0", () => {
    const [s] = recurringSuggestions(
      [
        entry({
          entry_date: "2026-08-05",
          total_amount_centavos: 100000,
          owed_amount_centavos: 0,
        }),
        entry({
          entry_date: "2026-09-05",
          total_amount_centavos: 100000,
          owed_amount_centavos: 0,
        }),
      ],
      today,
    );
    expect(s.owedCentavos).toBe(0);
    expect(s.totalCentavos).toBe(100000);
  });

  it("uses the newest spelling and shows at most three, most regular first", () => {
    const bills = ["Kuryente", "Tubig", "Internet", "Netflix"].flatMap(
      (description, i) => [
        entry({ description, entry_date: "2026-08-04" }),
        entry({ description, entry_date: "2026-09-05" }),
        ...(i === 3 ? [entry({ description, entry_date: "2026-07-04" })] : []),
      ],
    );
    const list = recurringSuggestions(bills, today);
    expect(list).toHaveLength(3);
    expect(list[0].description).toBe("Netflix");
    const respelled = recurringSuggestions(
      [
        entry({ entry_date: "2026-08-04", description: "kuryente" }),
        entry({ entry_date: "2026-09-05", description: "  Kuryente  " }),
      ],
      today,
    );
    expect(respelled[0].description).toBe("Kuryente");
  });

  it("filters by payer before cutting to three", () => {
    const old = ["a", "b", "c"].flatMap((description) => [
      entry({ description, from_member: "gone", entry_date: "2026-08-04" }),
      entry({ description, from_member: "gone", entry_date: "2026-09-05" }),
      entry({ description, from_member: "gone", entry_date: "2026-07-05" }),
    ]);
    const mine = twoMonths();
    const all = [...old, ...mine];
    // "gone" bills are seen in three months and would take every slot.
    expect(recurringSuggestions(all, today).map((s) => s.payerId)).toEqual([
      "gone",
      "gone",
      "gone",
    ]);
    const only = recurringSuggestions(
      all,
      today,
      new Set(),
      new Set([me, partner]),
    );
    expect(only.map((s) => s.description)).toEqual(["Kuryente"]);
  });

  it("hides a dismissed bill", () => {
    const entries = twoMonths();
    const [s] = recurringSuggestions(entries, today);
    expect(recurringSuggestions(entries, today, new Set([s.key]))).toEqual([]);
    expect(
      recurringSuggestions(entries, today, new Set(["me|something else"])),
    ).toHaveLength(1);
  });
});

describe("median and share maths", () => {
  it("takes the middle value, half up for an even count", () => {
    expect(medianCentavos([])).toBe(0);
    expect(medianCentavos([5])).toBe(5);
    expect(medianCentavos([9, 1, 5])).toBe(5);
    expect(medianCentavos([1, 2])).toBe(2);
    expect(medianCentavos([1, 4])).toBe(3);
  });

  it("scales a share to the centavo and keeps it within 1..total", () => {
    expect(scaleShare(100000, 50000, 100000)).toBe(50000);
    expect(scaleShare(10001, 1, 3)).toBe(3334);
    expect(scaleShare(100, 1, 1000)).toBe(1);
    expect(scaleShare(100, 100, 100)).toBe(100);
    expect(scaleShare(500, 1, 0)).toBe(500);
    // A past "all mine" (share 0) stays 0 instead of becoming 1 centavo.
    expect(scaleShare(100000, 0, 100000)).toBe(0);
    expect(scaleShare(100000, 0, 50000)).toBe(0);
  });
});

describe("dismissal storage", () => {
  const fakeStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  };

  it("remembers a dismissal for the month only, per user", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readDismissed("u1", "2026-10").size).toBe(0);
    const after = dismissSuggestion("u1", "2026-10", "me|kuryente");
    expect(after.has("me|kuryente")).toBe(true);
    expect(readDismissed("u1", "2026-10").has("me|kuryente")).toBe(true);
    expect(readDismissed("u1", "2026-11").size).toBe(0);
    expect(readDismissed("u2", "2026-10").size).toBe(0);
  });

  it("keeps working when storage throws or holds junk", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readDismissed("u1", "2026-10").size).toBe(0);
    expect(dismissSuggestion("u1", "2026-10", "k").has("k")).toBe(true);
    vi.stubGlobal("localStorage", {
      getItem: () => "{not json",
      setItem: () => undefined,
    });
    expect(readDismissed("u1", "2026-10").size).toBe(0);
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ month: "2026-10", keys: [1, 2] }),
      setItem: () => undefined,
    });
    expect(readDismissed("u1", "2026-10").size).toBe(0);
  });
});
