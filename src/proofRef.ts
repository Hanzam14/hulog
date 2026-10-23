/**
 * Optional payment proof reference (SPEC 10.14): the e-wallet reference number
 * (GCash or Maya ref no.) of a payment. Never an account number or PIN, so it
 * is kept short and plain. The server enforces the same rule.
 */
export const PROOF_REF_MIN = 4;
export const PROOF_REF_MAX = 40;
export const PROOF_REF_ERROR =
  "Reference must be 4 to 40 letters, numbers, spaces or dashes";

export const PROOF_REF_LOCKED =
  "Reference can only be changed by its creator while pending";

const PROOF_REF_PATTERN = /^[A-Za-z0-9 -]+$/;

/** Trim a reference. Blank means "none" (null); a bad one throws. */
export function cleanProofRef(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (
    value.length < PROOF_REF_MIN ||
    value.length > PROOF_REF_MAX ||
    !PROOF_REF_PATTERN.test(value)
  )
    throw new Error(PROOF_REF_ERROR);
  return value;
}

/** True when the text is empty or a reference the server will accept. */
export function proofRefValid(raw: string): boolean {
  try {
    cleanProofRef(raw);
    return true;
  } catch {
    return false;
  }
}

const EDIT_PAYMENT_KEYS = ["p_id", "p_days", "p_delete", "p_note"];
const EDIT_ABONO_KEYS = [
  "p_id",
  "p_from_member",
  "p_to_member",
  "p_description",
  "p_total_amount_centavos",
  "p_owed_amount_centavos",
  "p_entry_date",
  "p_note",
  "p_delete",
];

/**
 * The edit RPCs that take a reference are separate overloads without defaults
 * (the server picks one from the argument names), so every argument is sent:
 * null means "leave as is" and an empty reference clears it. Pass undefined
 * to keep using the original form.
 */
function withRef(
  keys: string[],
  args: Record<string, unknown>,
  proofRef: string | null | undefined,
): Record<string, unknown> {
  if (proofRef === undefined) return args;
  const full: Record<string, unknown> = {};
  for (const key of keys)
    full[key] = args[key] ?? (key === "p_delete" ? false : null);
  return { ...full, p_proof_ref: proofRef ?? "" };
}

export const editPaymentArgs = (
  args: Record<string, unknown>,
  proofRef?: string | null,
) => withRef(EDIT_PAYMENT_KEYS, args, proofRef);

export const editAbonoArgs = (
  args: Record<string, unknown>,
  proofRef?: string | null,
) => withRef(EDIT_ABONO_KEYS, args, proofRef);
