import { describe, expect, it } from "vitest";
import { buildSettlementPayload } from "./helpers";
import {
  cleanProofRef,
  editAbonoArgs,
  editPaymentArgs,
  PROOF_REF_ERROR,
  proofRefValid,
} from "./proofRef";

describe("cleanProofRef", () => {
  it("trims and keeps a valid reference", () => {
    expect(cleanProofRef("  GC 1234-ABCD  ")).toBe("GC 1234-ABCD");
  });

  it("treats blank and missing as no reference", () => {
    expect(cleanProofRef("")).toBeNull();
    expect(cleanProofRef("   ")).toBeNull();
    expect(cleanProofRef(null)).toBeNull();
    expect(cleanProofRef(undefined)).toBeNull();
  });

  it("accepts the 4 and 40 character edges", () => {
    expect(cleanProofRef("1234")).toBe("1234");
    expect(cleanProofRef("A".repeat(40))).toBe("A".repeat(40));
  });

  it("rejects too short, too long and other characters", () => {
    for (const bad of [
      "abc",
      "A".repeat(41),
      "ref#1234",
      "1234;drop",
      "ñandú1234",
      "12 34\n5678",
    ])
      expect(() => cleanProofRef(bad)).toThrow(PROOF_REF_ERROR);
  });
});

describe("proofRefValid", () => {
  it("allows empty text and valid references only", () => {
    expect(proofRefValid("")).toBe(true);
    expect(proofRefValid("  ")).toBe(true);
    expect(proofRefValid("GCash 99887766")).toBe(true);
    expect(proofRefValid("x")).toBe(false);
  });
});

describe("edit arguments", () => {
  it("keeps the original form when there is no reference to send", () => {
    const args = { p_id: "x", p_note: "hi" };
    expect(editPaymentArgs(args)).toBe(args);
    expect(editAbonoArgs(args, undefined)).toBe(args);
  });

  it("sends every argument for the overload that takes a reference", () => {
    expect(editPaymentArgs({ p_id: "x", p_days: 3 }, "GC 1234")).toEqual({
      p_id: "x",
      p_days: 3,
      p_delete: false,
      p_note: null,
      p_proof_ref: "GC 1234",
    });
    expect(
      editAbonoArgs(
        { p_id: "x", p_note: "n", p_owed_amount_centavos: 5 },
        null,
      ),
    ).toEqual({
      p_id: "x",
      p_from_member: null,
      p_to_member: null,
      p_description: null,
      p_total_amount_centavos: null,
      p_owed_amount_centavos: 5,
      p_entry_date: null,
      p_note: "n",
      p_delete: false,
      p_proof_ref: "",
    });
  });
});

describe("settlement payload", () => {
  const base = {
    debtorId: "a",
    creditorId: "b",
    amountCentavos: 1000,
    entryDate: "2026-10-23",
    note: " hi ",
  };

  it("adds the trimmed reference only when given", () => {
    expect(buildSettlementPayload(base)).not.toHaveProperty("p_proof_ref");
    expect(
      buildSettlementPayload({ ...base, proofRef: "   " }),
    ).not.toHaveProperty("p_proof_ref");
    expect(
      buildSettlementPayload({ ...base, proofRef: " MAYA 9999 " }),
    ).toMatchObject({ p_proof_ref: "MAYA 9999", p_note: "hi" });
    expect(() => buildSettlementPayload({ ...base, proofRef: "no" })).toThrow(
      PROOF_REF_ERROR,
    );
  });
});
