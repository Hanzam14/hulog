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

export function isSoloGoal(goal: { title: string } | string): boolean {
  const title = typeof goal === "string" ? goal : goal.title;
  return /^\[Solo(?::\s*[^\]]+)?\]/i.test(title.trim());
}

export function cleanGoalTitle(title: string): string {
  return title.replace(/^\[Solo(?::\s*[^\]]+)?\]\s*/i, "").trim() || title;
}

export function formatGoalName(goal: { title: string } | string): string {
  return cleanGoalTitle(typeof goal === "string" ? goal : goal.title);
}

export function getSoloBadgeText(
  goal: { title: string; proposed_by?: string },
  data: {
    memberships?: { user_id: string; status: string }[];
    profiles?: { id: string; display_name: string; nickname?: string | null }[];
  },
  currentUserId?: string,
): string {
  if (!isSoloGoal(goal)) return "";
  const activeMembers = (data.memberships ?? []).filter(
    (m) => m.status === "active",
  );
  const isMultiMember = activeMembers.length > 1;
  const isOwner = !goal.proposed_by || goal.proposed_by === currentUserId;

  if (isOwner) {
    return isMultiMember
      ? t("Solo · You (Partner can view)")
      : t("Solo · You");
  }

  const ownerProfile = (data.profiles ?? []).find(
    (p) => p.id === goal.proposed_by,
  );
  const rawName =
    ownerProfile?.nickname || ownerProfile?.display_name || "Partner";
  const firstName = rawName.trim().split(/\s+/)[0];
  return t("Solo · {name} — visible to partner", { name: firstName });
}

export function isSoloCycle(
  c: {
    target_centavos: number;
    daily_amount_centavos: number;
    num_days: number;
    is_solo?: boolean;
  },
): boolean {
  return c.is_solo === true;
}

export function getSoloCycleBadgeText(
  c: {
    receiver_id?: string;
    is_solo?: boolean;
    target_centavos: number;
    daily_amount_centavos: number;
    num_days: number;
  },
  data: {
    memberships?: { user_id: string; status: string }[];
    profiles?: { id: string; display_name: string; nickname?: string | null }[];
  },
  currentUserId?: string,
): string {
  const activeMembers = (data.memberships ?? []).filter(
    (m) => m.status === "active",
  );
  if (!isSoloCycle(c)) return "";
  const isMultiMember = activeMembers.length > 1;
  const isOwner = !c.receiver_id || c.receiver_id === currentUserId;

  if (isOwner) {
    return isMultiMember
      ? t("Solo · You (Partner can view)")
      : t("Solo · You");
  }

  const ownerProfile = (data.profiles ?? []).find(
    (p) => p.id === c.receiver_id,
  );
  const rawName =
    ownerProfile?.nickname || ownerProfile?.display_name || "Partner";
  const firstName = rawName.trim().split(/\s+/)[0];
  return t("Solo · {name} — visible to partner", { name: firstName });
}
