import { describe, expect, it } from "vitest";
import type { Profile, Snapshot } from "../data";
import { name, tone } from "./shared";

function pair(ownerColor = "auto", partnerColor = "auto"): Snapshot {
  return {
    profiles: [
      {
        id: "owner",
        display_name: "Google A",
        nickname: "A",
        color: ownerColor,
      },
      {
        id: "partner",
        display_name: "Google B",
        nickname: null,
        color: partnerColor,
      },
    ] as Profile[],
    groups: [
      { id: "group", owner_id: "owner", name: "Us", pot_location: "Bank" },
    ],
    memberships: [],
    cycles: [],
    payments: [],
    repayments: [],
    progress: [],
    changes: [],
    invites: [],
    today: "2026-10-07",
  };
}

describe("personalized member stickers", () => {
  it("uses the nickname, with Google name and missing-member fallbacks", () => {
    expect(name(pair(), "owner")).toBe("A");
    expect(name(pair(), "partner")).toBe("Google B");
    expect(name(pair(), "missing")).toBe("Member");
  });
  it("keeps auto owner pink and partner blue", () => {
    expect(tone(pair(), "owner")).toBe("pink");
    expect(tone(pair(), "partner")).toBe("blue");
  });
  it.each(["green", "orange", "purple"])(
    "honors %s without a collision",
    (color) => {
      expect(tone(pair(color), "owner")).toBe(color);
      expect(tone(pair("pink", color), "partner")).toBe(color);
    },
  );
  it.each([
    ["pink", "pink", "blue"],
    ["blue", "blue", "pink"],
    ["green", "green", "pink"],
    ["orange", "orange", "pink"],
    ["purple", "purple", "pink"],
    ["auto", "pink", "blue"],
    ["blue", "auto", "pink"],
  ])(
    "owner %s keeps their color when partner chooses %s",
    (owner, partner, fallback) => {
      const data = pair(owner, partner);
      expect(tone(data, "owner")).toBe(owner === "auto" ? "pink" : owner);
      expect(tone(data, "partner")).toBe(fallback);
      data.profiles.reverse();
      expect(tone(data, "partner")).toBe(fallback);
    },
  );
});
