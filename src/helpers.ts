import { t } from "./i18n";
import { cleanProofRef } from "./proofRef";
export function money(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}
export function parsePesos(value: string, allowZero = false): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter pesos with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(result) ||
    result < 0 ||
    (result === 0 && !allowZero)
  )
    throw new Error("Enter a positive amount.");
  return result;
}
/** What an abono entry moves: the share owed, or the whole total when the share is 0. */
export function abonoAmount(entry: {
  owed_amount_centavos: number;
  total_amount_centavos: number;
}): number {
  return entry.owed_amount_centavos > 0
    ? entry.owed_amount_centavos
    : entry.total_amount_centavos;
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
export function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
/** Collect sorted descending YYYY-MM months present in past cycles and goals. */
export function historyMonths(
  cycles: { end_date: string }[],
  goals: { end_date: string }[],
): string[] {
  const set = new Set<string>();
  for (const c of cycles) {
    if (c.end_date) set.add(c.end_date.slice(0, 7));
  }
  for (const g of goals) {
    if (g.end_date) set.add(g.end_date.slice(0, 7));
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}
/** Filter past cycles, past savings goals, and compute summary totals by month and member. */
export function filterHistory<
  C extends {
    id: string;
    end_date: string;
    receiver_id: string;
    pot_centavos: number;
  },
  G extends {
    id: string;
    end_date: string;
    holder_id: string;
    proposed_by: string;
    saved_centavos: number;
  },
>(args: {
  cycles: C[];
  goals: G[];
  progress: { cycle_id: string; member_id: string; debt_centavos: number }[];
  month: string;
  memberId: string;
}): {
  cycles: C[];
  goals: G[];
  totalPotCentavos: number;
  totalSavedCentavos: number;
  totalDebtCentavos: number;
} {
  const { month, memberId, progress } = args;
  const cycles = args.cycles.filter((c) => {
    if (month !== "all" && c.end_date.slice(0, 7) !== month) return false;
    if (memberId !== "all" && c.receiver_id !== memberId) return false;
    return true;
  });
  const goals = args.goals.filter((g) => {
    if (month !== "all" && g.end_date.slice(0, 7) !== month) return false;
    if (
      memberId !== "all" &&
      g.holder_id !== memberId &&
      g.proposed_by !== memberId
    )
      return false;
    return true;
  });
  const cycleIds = new Set(cycles.map((c) => c.id));
  const totalPotCentavos = cycles.reduce((sum, c) => sum + c.pot_centavos, 0);
  const totalSavedCentavos = goals.reduce(
    (sum, g) => sum + g.saved_centavos,
    0,
  );
  const totalDebtCentavos = progress
    .filter((p) => cycleIds.has(p.cycle_id))
    .reduce((sum, p) => sum + Math.max(0, p.debt_centavos), 0);
  return {
    cycles,
    goals,
    totalPotCentavos,
    totalSavedCentavos,
    totalDebtCentavos,
  };
}
/** Compute percent saved and cadence pace status for an Ipon goal. */
export function iponGoalProgress(goal: {
  saved_centavos: number;
  target_amount_centavos: number;
  goal_mode: "matched" | "flexible";
  step_amount_centavos: number | null;
  expected_steps_today: number;
  start_date: string;
  end_date: string;
  phase: string;
}): {
  percent: number;
  onTrack: boolean;
  paceLabel: string;
  reachedTarget: boolean;
} {
  const raw =
    goal.target_amount_centavos > 0
      ? (goal.saved_centavos / goal.target_amount_centavos) * 100
      : 0;
  const percent = Math.min(100, Math.max(0, Math.round(raw)));
  const reachedTarget =
    goal.target_amount_centavos > 0 &&
    goal.saved_centavos >= goal.target_amount_centavos;

  let expectedCentavos = 0;
  if (goal.goal_mode === "matched" && goal.step_amount_centavos) {
    expectedCentavos =
      goal.expected_steps_today * goal.step_amount_centavos * 2;
  } else if (goal.phase === "overdue") {
    expectedCentavos = goal.target_amount_centavos;
  }

  const onTrack =
    reachedTarget ||
    (goal.phase !== "overdue" && goal.saved_centavos >= expectedCentavos);

  return {
    percent,
    onTrack,
    paceLabel: onTrack ? t("On track") : t("Behind"),
    reachedTarget,
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

/** Build the RPC payload for recording an abono settlement entry. */
export function buildSettlementPayload(args: {
  debtorId: string;
  creditorId: string;
  amountCentavos: number;
  entryDate: string;
  note: string;
  /** Optional e-wallet reference number (SPEC 10.14). */
  proofRef?: string;
}) {
  const proofRef = cleanProofRef(args.proofRef);
  return {
    p_kind: "settlement" as const,
    p_from_member: args.debtorId,
    p_to_member: args.creditorId,
    p_description: "Settlement",
    p_total_amount_centavos: args.amountCentavos,
    p_owed_amount_centavos: args.amountCentavos,
    p_entry_date: args.entryDate,
    p_note: args.note.trim(),
    ...(proofRef ? { p_proof_ref: proofRef } : {}),
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
    return isMultiMember ? t("Solo · You (Partner can view)") : t("Solo · You");
  }

  const ownerProfile = (data.profiles ?? []).find(
    (p) => p.id === goal.proposed_by,
  );
  const rawName =
    ownerProfile?.nickname || ownerProfile?.display_name || "Partner";
  const firstName = rawName.trim().split(/\s+/)[0];
  return t("Solo · {name} — visible to partner", { name: firstName });
}

export function isSoloCycle(c: {
  target_centavos: number;
  daily_amount_centavos: number;
  num_days: number;
  is_solo?: boolean;
}): boolean {
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
    return isMultiMember ? t("Solo · You (Partner can view)") : t("Solo · You");
  }

  const ownerProfile = (data.profiles ?? []).find(
    (p) => p.id === c.receiver_id,
  );
  const rawName =
    ownerProfile?.nickname || ownerProfile?.display_name || "Partner";
  const firstName = rawName.trim().split(/\s+/)[0];
  return t("Solo · {name} — visible to partner", { name: firstName });
}
