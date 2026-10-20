import { t } from "./i18n";
export function money(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}
export function parsePesos(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter pesos with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error("Enter a positive amount.");
  return result;
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** "2026-10-07" → "Oct 7": compact enough for a sticker. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export function phaseDisplay(phase: string, daysLeft: number): string {
  if (phase === "open")
    return t("Open · {days} {unit} left", {
      days: daysLeft,
      unit: t(daysLeft === 1 ? "day" : "days"),
    });
  return (
    (
      {
        upcoming: t("Upcoming · paying ahead is okay"),
        settling: t("Settling · last day to confirm"),
        ended: t("Ended"),
        proposed: t("Waiting for agreement"),
        declined: t("Declined"),
        cancelled: t("Cancelled"),
        completed: t("Goal reached ✓"),
        withdrawn: t("Withdrawn"),
        overdue: t("Past target date"),
        expired: t("Proposal expired"),
      } as Record<string, string>
    )[phase] ?? phase
  );
}
export function cadenceDisplay(cadenceDays: number | null): string {
  if (cadenceDays === null) return t("Flexible anytime");
  if (cadenceDays === 1) return t("Every day");
  if (cadenceDays === 7) return t("Every week");
  return t("Every {days} days", { days: cadenceDays });
}
export function splitHalfCentavos(totalCentavos: number): number {
  return Math.ceil(totalCentavos / 2);
}
/** Build the RPC payload for recording an abono settlement entry. */
export function buildSettlementPayload(args: {
  debtorId: string;
  creditorId: string;
  amountCentavos: number;
  entryDate: string;
  note: string;
}) {
  return {
    p_kind: "settlement" as const,
    p_from_member: args.debtorId,
    p_to_member: args.creditorId,
    p_description: "Settlement",
    p_total_amount_centavos: args.amountCentavos,
    p_owed_amount_centavos: args.amountCentavos,
    p_entry_date: args.entryDate,
    p_note: args.note.trim(),
  };
}
/** Compute a next-payout countdown line for an active unreceived cycle, or null. */
export function payoutCountdown(
  cycle:
    | {
        status: string;
        end_date: string;
        receiver_id: string;
        payout_state: string | null;
        received_at: string | null;
      }
    | null
    | undefined,
  today: string,
  userId: string,
  receiverName: string,
): string | null {
  if (
    !cycle ||
    cycle.status !== "accepted" ||
    cycle.payout_state === "Received" ||
    cycle.received_at != null
  ) {
    return null;
  }
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const endMs = new Date(`${addDays(cycle.end_date, 1)}T00:00:00Z`).getTime();
  const diffDays = Math.round((endMs - todayMs) / 86400000);
  const turn =
    cycle.receiver_id === userId
      ? t("your turn")
      : t("{name}'s turn", { name: receiverName });
  if (diffDays < 0) return t("Payout overdue - {turn}", { turn });
  if (diffDays === 0) return t("Payout today - {turn}", { turn });
  if (diffDays === 1) return t("Payout tomorrow - {turn}", { turn });
  return t("Payout in {days} days - {turn}", { days: diffDays, turn });
}
export function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    let text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    // Spreadsheet apps can execute cells beginning with these characters.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    keys.map(cell).join(","),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}
