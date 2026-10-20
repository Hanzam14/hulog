import type { Session } from "@supabase/supabase-js";
import type {
  Cycle,
  Group,
  Membership,
  Payment,
  Profile,
  Snapshot,
  Wallet,
  SavingsGoal,
  SavingsContribution,
  AbonoEntry,
} from "./data";
import { addDays } from "./helpers";

const SOLO_MODE_KEY = "hulog-solo-mode";
const SOLO_SNAPSHOT_KEY = "hulog-solo-snapshot";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

export function getManilaToday(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function isSoloMode(): boolean {
  try {
    return localStorage.getItem(SOLO_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoloMode(enabled: boolean, userId?: string): void {
  try {
    localStorage.setItem(SOLO_MODE_KEY, enabled ? "true" : "false");
    if (enabled) {
      const existing = loadRawSoloSnapshot();
      if (!existing) {
        saveRawSoloSnapshot(createInitialSoloSnapshot(userId));
      } else if (userId && existing.memberships[0]?.user_id !== userId) {
        const oldId = existing.memberships[0]?.user_id ?? "solo-user";
        adaptSoloSnapshotUser(existing, oldId, userId);
        saveRawSoloSnapshot(existing);
      }
    }
  } catch {
    // Storage can be restricted in some environments.
  }
}

export function getSoloUserId(): string {
  try {
    const raw = localStorage.getItem(SOLO_SNAPSHOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.memberships?.[0]?.user_id) {
        return parsed.memberships[0].user_id;
      }
    }
  } catch {
    // ignore
  }
  return "solo-user";
}

export function getSoloSession(userId?: string): Session {
  const uid = userId ?? getSoloUserId();
  return {
    access_token: "solo-access-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "solo-refresh-token",
    user: {
      id: uid,
      app_metadata: {},
      user_metadata: { full_name: "You" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "solo@hulog.local",
      phone: "",
      role: "authenticated",
      updated_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

export function createInitialSoloSnapshot(userId?: string): Snapshot {
  const uid = userId ?? "solo-user";
  const today = getManilaToday();
  const groupId = "solo-group";
  const walletId = "solo-wallet";

  const profile: Profile = {
    id: uid,
    display_name: "You",
    email: "solo@hulog.local",
    avatar_url: null,
    nickname: "Ikaw",
    avatar_kind: "initial",
    avatar_emoji: "🐷",
    color: "pink",
  };

  const group: Group = {
    id: groupId,
    name: "My Savings",
    owner_id: uid,
    pot_location: "Personal Pot",
  };

  const membership: Membership = {
    group_id: groupId,
    user_id: uid,
    status: "active",
    last_seen_history_at: new Date().toISOString(),
  };

  const wallet: Wallet = {
    id: walletId,
    group_id: groupId,
    holder_id: uid,
    label: "Main Pot",
    archived_at: null,
    created_by: uid,
    created_at: new Date().toISOString(),
  };

  return {
    profiles: [profile],
    groups: [group],
    memberships: [membership],
    cycles: [],
    payments: [],
    repayments: [],
    progress: [],
    changes: [],
    invites: [],
    today,
    wallets: [wallet],
    custody: [
      {
        wallet_id: walletId,
        group_id: groupId,
        holder_id: uid,
        label: "Main Pot",
        archived_at: null,
        holder_active: true,
        paluwagan_centavos: 0,
        ipon_centavos: 0,
        total_centavos: 0,
      },
    ],
    savingsGoals: [],
    savingsContributions: [],
    savingsProgress: [],
    abonoEntries: [],
    abonoSummary: [],
  };
}

function adaptSoloSnapshotUser(
  snapshot: Snapshot,
  oldId: string,
  newId: string,
): void {
  for (const p of snapshot.profiles) {
    if (p.id === oldId) p.id = newId;
  }
  for (const g of snapshot.groups) {
    if (g.owner_id === oldId) g.owner_id = newId;
  }
  for (const m of snapshot.memberships) {
    if (m.user_id === oldId) m.user_id = newId;
  }
  for (const w of snapshot.wallets ?? []) {
    if (w.holder_id === oldId) w.holder_id = newId;
    if (w.created_by === oldId) w.created_by = newId;
  }
  for (const c of snapshot.custody ?? []) {
    if (c.holder_id === oldId) c.holder_id = newId;
  }
  for (const c of snapshot.cycles) {
    if (c.receiver_id === oldId) c.receiver_id = newId;
    if (c.proposed_by === oldId) c.proposed_by = newId;
    if (c.holder_id === oldId) c.holder_id = newId;
  }
  for (const p of snapshot.payments) {
    if (p.member_id === oldId) p.member_id = newId;
  }
  for (const pr of snapshot.progress) {
    if (pr.member_id === oldId) pr.member_id = newId;
  }
  for (const sg of snapshot.savingsGoals ?? []) {
    if (sg.proposed_by === oldId) sg.proposed_by = newId;
    if (sg.holder_id === oldId) sg.holder_id = newId;
    if (sg.accepted_by === oldId) sg.accepted_by = newId;
    if (sg.withdrawn_by === oldId) sg.withdrawn_by = newId;
  }
  for (const sc of snapshot.savingsContributions ?? []) {
    if (sc.member_id === oldId) sc.member_id = newId;
    if (sc.created_by === oldId) sc.created_by = newId;
    if (sc.confirmed_by === oldId) sc.confirmed_by = newId;
  }
  for (const sp of snapshot.savingsProgress ?? []) {
    if (sp.member_id === oldId) sp.member_id = newId;
  }
}

function loadRawSoloSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SOLO_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

function saveRawSoloSnapshot(snapshot: Snapshot): void {
  try {
    localStorage.setItem(SOLO_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors
  }
}

function computeCyclePhase(
  startDate: string,
  endDate: string,
  today: string,
): { phase: string; daysLeft: number } {
  const tTime = new Date(`${today}T00:00:00Z`).getTime();
  const sTime = new Date(`${startDate}T00:00:00Z`).getTime();
  const eTime = new Date(`${endDate}T00:00:00Z`).getTime();
  const settlingDate = addDays(endDate, 1);
  const settlingTime = new Date(`${settlingDate}T00:00:00Z`).getTime();

  let phase: string;
  if (tTime < sTime) {
    phase = "upcoming";
  } else if (tTime <= eTime) {
    phase = "open";
  } else if (tTime === settlingTime) {
    phase = "settling";
  } else {
    phase = "ended";
  }

  const daysLeft = Math.max(0, Math.ceil((eTime - tTime) / 86400000));
  return { phase, daysLeft };
}

function computeGoalPhase(
  goal: SavingsGoal,
  today: string,
): { phase: string; daysLeft: number } {
  const tTime = new Date(`${today}T00:00:00Z`).getTime();
  const sTime = new Date(`${goal.start_date}T00:00:00Z`).getTime();
  const eTime = new Date(`${goal.end_date}T00:00:00Z`).getTime();

  let phase: string;
  if (goal.withdrawn_at) {
    phase = "withdrawn";
  } else if (goal.saved_centavos >= goal.target_amount_centavos) {
    phase = "completed";
  } else if (tTime < sTime) {
    phase = "upcoming";
  } else if (tTime <= eTime) {
    phase = "open";
  } else {
    phase = "overdue";
  }

  const daysLeft = Math.max(0, Math.ceil((eTime - tTime) / 86400000));
  return { phase, daysLeft };
}

export async function loadSoloSnapshot(): Promise<Snapshot> {
  let snapshot = loadRawSoloSnapshot();
  if (!snapshot) {
    snapshot = createInitialSoloSnapshot();
  }

  const today = getManilaToday();
  snapshot.today = today;
  const uid = snapshot.memberships[0]?.user_id ?? "solo-user";

  if (!snapshot.wallets || snapshot.wallets.length === 0) {
    snapshot.wallets = [
      {
        id: "solo-wallet",
        group_id: snapshot.groups[0]?.id ?? "solo-group",
        holder_id: uid,
        label: "Main Pot",
        archived_at: null,
        created_by: uid,
        created_at: new Date().toISOString(),
      },
    ];
  }

  // Recalculate cycles
  for (const c of snapshot.cycles) {
    const { phase, daysLeft } = computeCyclePhase(c.start_date, c.end_date, today);
    c.phase = phase;
    c.days_left = daysLeft;
    if (phase === "settling" || phase === "ended") {
      c.payout_state = "Received";
      if (!c.received_at) c.received_at = new Date().toISOString();
    }

    const confirmedPayments = snapshot.payments.filter(
      (p) => p.cycle_id === c.id && !p.deleted_at && p.status === "confirmed",
    );
    c.pot_centavos = confirmedPayments.reduce(
      (sum, p) => sum + p.amount_centavos,
      0,
    );
  }

  // Recalculate progress for cycles
  snapshot.progress = snapshot.cycles.map((c) => {
    const memberPayments = snapshot.payments.filter(
      (p) =>
        p.cycle_id === c.id &&
        p.member_id === uid &&
        !p.deleted_at &&
        p.status === "confirmed",
    );
    const confirmedDays = memberPayments.reduce((sum, p) => sum + p.days, 0);
    return {
      cycle_id: c.id,
      member_id: uid,
      expected_centavos: c.daily_amount_centavos * c.num_days,
      confirmed_days: confirmedDays,
      pending_days: 0,
      pending_count: 0,
      debt_centavos: 0,
    };
  });

  // Recalculate savings goals
  snapshot.savingsGoals = snapshot.savingsGoals ?? [];
  for (const g of snapshot.savingsGoals) {
    const confirmedContributions = (snapshot.savingsContributions ?? []).filter(
      (sc) => sc.goal_id === g.id && !sc.deleted_at && sc.status === "confirmed",
    );
    g.saved_centavos = confirmedContributions.reduce(
      (sum, sc) => sum + sc.amount_centavos,
      0,
    );
    const { phase, daysLeft } = computeGoalPhase(g, today);
    g.phase = phase;
    g.days_left = daysLeft;
  }

  // Recalculate savingsProgress
  snapshot.savingsProgress = snapshot.savingsGoals.map((g) => {
    const memberContributions = (snapshot.savingsContributions ?? []).filter(
      (sc) =>
        sc.goal_id === g.id &&
        sc.member_id === uid &&
        !sc.deleted_at &&
        sc.status === "confirmed",
    );
    const confirmedCentavos = memberContributions.reduce(
      (sum, sc) => sum + sc.amount_centavos,
      0,
    );
    const confirmedSteps = memberContributions.reduce(
      (sum, sc) => sum + (sc.steps ?? 0),
      0,
    );
    return {
      goal_id: g.id,
      member_id: uid,
      expected_centavos: g.target_amount_centavos,
      confirmed_centavos: confirmedCentavos,
      pending_centavos: 0,
      confirmed_steps: confirmedSteps,
      pending_steps: 0,
    };
  });

  // Recalculate custody
  const activeWallets = (snapshot.wallets ?? []).filter((w) => !w.archived_at);
  snapshot.custody = activeWallets.map((w) => {
    const paluwaganCentavos = snapshot.cycles
      .filter((c) => c.wallet_id === w.id && c.payout_state !== "Received")
      .reduce((sum, c) => sum + c.pot_centavos, 0);

    const iponCentavos = (snapshot.savingsGoals ?? [])
      .filter((g) => g.wallet_id === w.id && !g.withdrawn_at)
      .reduce((sum, g) => sum + g.saved_centavos, 0);

    return {
      wallet_id: w.id,
      group_id: w.group_id,
      holder_id: w.holder_id,
      label: w.label,
      archived_at: w.archived_at,
      holder_active: true,
      paluwagan_centavos: paluwaganCentavos,
      ipon_centavos: iponCentavos,
      total_centavos: paluwaganCentavos + iponCentavos,
    };
  });

  saveRawSoloSnapshot(snapshot);
  return snapshot;
}

export async function soloRpc(
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const snapshot = await loadSoloSnapshot();
  const uid = snapshot.memberships[0]?.user_id ?? "solo-user";
  const today = snapshot.today;

  switch (name) {
    case "hulog_today":
      return today;

    case "get_notification_prefs":
      return [{ language: "en", reminder_time: "20:00", enabled: false }];

    case "set_notification_prefs":
    case "set_notification_language":
    case "save_push_subscription":
    case "delete_push_subscription":
    case "mark_history_seen":
    case "revoke_invite":
    case "review_member":
    case "claim_invite":
      return true;

    case "create_invite":
      return "solo-invite-link";

    case "create_group": {
      const pName = (args.p_name as string) || "My Savings";
      const pPot = (args.p_pot_location as string) || "";
      snapshot.groups[0].name = pName;
      snapshot.groups[0].pot_location = pPot;
      saveRawSoloSnapshot(snapshot);
      return snapshot.groups[0].id;
    }

    case "update_group": {
      const pName = (args.p_name as string) || snapshot.groups[0].name;
      const pPot = (args.p_pot_location as string) ?? snapshot.groups[0].pot_location;
      snapshot.groups[0].name = pName;
      snapshot.groups[0].pot_location = pPot;
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "update_profile": {
      const p = snapshot.profiles[0];
      if (p) {
        if (args.p_nickname !== undefined) p.nickname = args.p_nickname as string;
        if (args.p_avatar_kind !== undefined)
          p.avatar_kind = args.p_avatar_kind as Profile["avatar_kind"];
        if (args.p_avatar_emoji !== undefined)
          p.avatar_emoji = args.p_avatar_emoji as string;
        if (args.p_color !== undefined) p.color = args.p_color as Profile["color"];
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "create_wallet": {
      const label = (args.p_label as string)?.trim() || "Wallet";
      const newWallet: Wallet = {
        id: generateId(),
        group_id: snapshot.groups[0].id,
        holder_id: uid,
        label,
        archived_at: null,
        created_by: uid,
        created_at: new Date().toISOString(),
      };
      snapshot.wallets = snapshot.wallets ?? [];
      snapshot.wallets.push(newWallet);
      saveRawSoloSnapshot(snapshot);
      return newWallet.id;
    }

    case "update_wallet": {
      const wallet = (snapshot.wallets ?? []).find((w) => w.id === args.p_id);
      if (wallet) {
        if (args.p_label) wallet.label = (args.p_label as string).trim();
        if (args.p_archive) wallet.archived_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "propose_cycle": {
      const dailyAmount = Number(args.p_daily_amount_centavos);
      const numDays = Number(args.p_num_days);
      const startDate = args.p_start_date as string;
      const receiverId = (args.p_receiver_id as string) || uid;
      const endDate = addDays(startDate, numDays - 1);
      const activeWallets = (snapshot.wallets ?? []).filter((w) => !w.archived_at);
      const wallet =
        activeWallets.find((w) => w.id === args.p_wallet_id) ?? activeWallets[0];

      // In solo mode: auto-confirms immediately! Target is 1x pool.
      const targetCentavos = dailyAmount * numDays * 1;
      const { phase, daysLeft } = computeCyclePhase(startDate, endDate, today);

      const cycle: Cycle = {
        id: generateId(),
        group_id: snapshot.groups[0].id,
        daily_amount_centavos: dailyAmount,
        num_days: numDays,
        start_date: startDate,
        end_date: endDate,
        receiver_id: receiverId,
        proposed_by: uid,
        status: "accepted",
        phase,
        pot_centavos: 0,
        target_centavos: targetCentavos,
        payout_state: null,
        received_at: null,
        days_left: daysLeft,
        created_at: new Date().toISOString(),
        wallet_id: wallet?.id,
        holder_id: wallet?.holder_id ?? uid,
        wallet_label: wallet?.label ?? "Main Pot",
        pending_wallet_id: null,
        wallet_proposed_by: null,
      };

      snapshot.cycles.push(cycle);
      snapshot.progress.push({
        cycle_id: cycle.id,
        member_id: uid,
        expected_centavos: targetCentavos,
        confirmed_days: 0,
        pending_days: 0,
        pending_count: 0,
        debt_centavos: 0,
      });

      saveRawSoloSnapshot(snapshot);
      return cycle.id;
    }

    case "respond_cycle": {
      const cycle = snapshot.cycles.find((c) => c.id === args.p_id);
      if (cycle) {
        const action = args.p_action as string;
        if (action === "accept") cycle.status = "accepted";
        else if (action === "decline") cycle.status = "declined";
        else if (action === "cancel") cycle.status = "cancelled";
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "record_payment": {
      const cycleId = args.p_cycle_id as string;
      const days = Number(args.p_days);
      const cycle = snapshot.cycles.find((c) => c.id === cycleId);
      if (!cycle) throw new Error("Cycle not found");

      const amountCentavos = days * cycle.daily_amount_centavos;
      // In solo mode: auto-confirms immediately!
      const payment: Payment = {
        id: generateId(),
        cycle_id: cycleId,
        member_id: uid,
        days,
        amount_centavos: amountCentavos,
        note: ((args.p_note as string) || "").trim(),
        status: "confirmed",
        was_confirmed: true,
        created_at: new Date().toISOString(),
        deleted_at: null,
      };

      snapshot.payments.push(payment);
      saveRawSoloSnapshot(snapshot);
      return payment.id;
    }

    case "edit_payment": {
      const payment = snapshot.payments.find((p) => p.id === args.p_id);
      if (payment) {
        if (args.p_delete) {
          payment.deleted_at = new Date().toISOString();
        } else {
          if (args.p_days !== undefined) {
            payment.days = Number(args.p_days);
            const cycle = snapshot.cycles.find((c) => c.id === payment.cycle_id);
            if (cycle) {
              payment.amount_centavos = payment.days * cycle.daily_amount_centavos;
            }
          }
          if (args.p_note !== undefined) {
            payment.note = ((args.p_note as string) || "").trim();
          }
        }
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "confirm_payment": {
      const payment = snapshot.payments.find((p) => p.id === args.p_id);
      if (payment) {
        payment.status = "confirmed";
        payment.was_confirmed = true;
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "receive_payout": {
      const cycle = snapshot.cycles.find((c) => c.id === args.p_id);
      if (cycle) {
        cycle.payout_state = "Received";
        cycle.received_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "give_payout": {
      const cycle = snapshot.cycles.find((c) => c.id === args.p_cycle_id);
      if (cycle) {
        cycle.receiver_id = uid;
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "propose_cycle_wallet": {
      const cycle = snapshot.cycles.find((c) => c.id === args.p_cycle_id);
      const wallet = (snapshot.wallets ?? []).find((w) => w.id === args.p_wallet_id);
      if (cycle && wallet) {
        cycle.wallet_id = wallet.id;
        cycle.holder_id = wallet.holder_id;
        cycle.wallet_label = wallet.label;
        cycle.pending_wallet_id = null;
        cycle.wallet_proposed_by = null;
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "respond_cycle_wallet":
      return true;

    case "propose_savings_goal": {
      const title = ((args.p_title as string) || "").trim();
      const goalMode = args.p_goal_mode as "matched" | "flexible";
      const startDate = args.p_start_date as string;
      const activeWallets = (snapshot.wallets ?? []).filter((w) => !w.archived_at);
      const wallet =
        activeWallets.find((w) => w.id === args.p_wallet_id) ?? activeWallets[0];

      let targetAmountCentavos: number;
      let endDate: string;
      let stepAmountCentavos: number | null = null;
      let cadenceDays: number | null = null;
      let numSteps: number | null = null;

      if (goalMode === "matched") {
        stepAmountCentavos = Number(args.p_step_amount_centavos);
        cadenceDays = Number(args.p_cadence_days);
        numSteps = Number(args.p_num_steps);
        // In solo mode: auto-confirms immediately! Target is 1x pool.
        targetAmountCentavos = stepAmountCentavos * numSteps * 1;
        endDate = addDays(startDate, (numSteps - 1) * cadenceDays);
      } else {
        targetAmountCentavos = Number(args.p_target_amount_centavos);
        endDate = args.p_end_date as string;
      }

      const goal: SavingsGoal = {
        id: generateId(),
        group_id: snapshot.groups[0].id,
        title,
        goal_mode: goalMode,
        wallet_id: wallet?.id ?? "solo-wallet",
        holder_id: wallet?.holder_id ?? uid,
        wallet_label: wallet?.label ?? "Main Pot",
        pending_wallet_id: null,
        wallet_proposed_by: null,
        target_amount_centavos: targetAmountCentavos,
        step_amount_centavos: stepAmountCentavos,
        cadence_days: cadenceDays,
        num_steps: numSteps,
        start_date: startDate,
        end_date: endDate,
        proposed_by: uid,
        status: "accepted", // Auto-confirm immediately!
        accepted_by: uid,
        accepted_at: new Date().toISOString(),
        withdraw_proposed_by: null,
        withdrawn_by: null,
        withdrawn_at: null,
        saved_centavos: 0,
        phase: "open",
        days_left: 0,
        expected_steps_today: 0,
        created_at: new Date().toISOString(),
      };

      snapshot.savingsGoals = snapshot.savingsGoals ?? [];
      snapshot.savingsGoals.push(goal);
      saveRawSoloSnapshot(snapshot);
      return goal.id;
    }

    case "respond_savings_goal": {
      const goal = (snapshot.savingsGoals ?? []).find((g) => g.id === args.p_id);
      if (goal) {
        const action = args.p_action as string;
        if (action === "accept") goal.status = "accepted";
        else if (action === "decline") goal.status = "declined";
        else if (action === "cancel") goal.status = "cancelled";
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "record_savings_contribution": {
      const goalId = args.p_goal_id as string;
      const steps = args.p_steps !== undefined ? Number(args.p_steps) : null;
      const amountCentavos = Number(args.p_amount_centavos);

      // In solo mode: auto-confirms immediately!
      const contribution: SavingsContribution = {
        id: generateId(),
        goal_id: goalId,
        member_id: uid,
        steps,
        amount_centavos: amountCentavos,
        note: ((args.p_note as string) || "").trim(),
        status: "confirmed",
        was_confirmed: true,
        created_by: uid,
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: new Date().toISOString(),
        confirmed_by: uid,
        confirmed_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };

      snapshot.savingsContributions = snapshot.savingsContributions ?? [];
      snapshot.savingsContributions.push(contribution);
      saveRawSoloSnapshot(snapshot);
      return contribution.id;
    }

    case "edit_savings_contribution": {
      const sc = (snapshot.savingsContributions ?? []).find(
        (c) => c.id === args.p_id,
      );
      if (sc) {
        if (args.p_delete) {
          sc.deleted_at = new Date().toISOString();
        } else {
          if (args.p_steps !== undefined) sc.steps = Number(args.p_steps);
          if (args.p_amount_centavos !== undefined)
            sc.amount_centavos = Number(args.p_amount_centavos);
          if (args.p_note !== undefined)
            sc.note = ((args.p_note as string) || "").trim();
        }
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "confirm_savings_contribution": {
      const sc = (snapshot.savingsContributions ?? []).find(
        (c) => c.id === args.p_id,
      );
      if (sc) {
        sc.status = "confirmed";
        sc.was_confirmed = true;
        sc.confirmed_by = uid;
        sc.confirmed_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "propose_withdraw_goal": {
      const goal = (snapshot.savingsGoals ?? []).find(
        (g) => g.id === args.p_goal_id,
      );
      if (goal) {
        // In solo mode: auto-confirms immediately!
        goal.withdrawn_by = uid;
        goal.withdrawn_at = new Date().toISOString();
        goal.phase = "withdrawn";
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "respond_withdraw_goal": {
      const goal = (snapshot.savingsGoals ?? []).find(
        (g) => g.id === args.p_goal_id,
      );
      if (goal) {
        goal.withdrawn_by = uid;
        goal.withdrawn_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "propose_goal_wallet": {
      const goal = (snapshot.savingsGoals ?? []).find(
        (g) => g.id === args.p_goal_id,
      );
      const wallet = (snapshot.wallets ?? []).find((w) => w.id === args.p_wallet_id);
      if (goal && wallet) {
        goal.wallet_id = wallet.id;
        goal.holder_id = wallet.holder_id;
        goal.wallet_label = wallet.label;
        goal.pending_wallet_id = null;
        goal.wallet_proposed_by = null;
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "respond_goal_wallet":
      return true;

    case "record_abono_entry": {
      const kind = (args.p_kind as "expense" | "settlement") || "expense";
      const totalAmount = Number(args.p_total_amount_centavos);
      const owedAmount = Number(args.p_owed_amount_centavos);
      const entry: AbonoEntry = {
        id: generateId(),
        group_id: snapshot.groups[0].id,
        kind,
        from_member: (args.p_from_member as string) || uid,
        to_member: (args.p_to_member as string) || uid,
        description: ((args.p_description as string) || "").trim(),
        total_amount_centavos: totalAmount,
        owed_amount_centavos: owedAmount,
        entry_date: (args.p_entry_date as string) || today,
        note: ((args.p_note as string) || "").trim(),
        status: "confirmed", // In solo mode: auto-confirms immediately!
        was_confirmed: true,
        created_by: uid,
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: new Date().toISOString(),
        confirmed_by: uid,
        confirmed_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      snapshot.abonoEntries = snapshot.abonoEntries ?? [];
      snapshot.abonoEntries.push(entry);
      saveRawSoloSnapshot(snapshot);
      return entry.id;
    }

    case "confirm_abono_entry": {
      const entry = (snapshot.abonoEntries ?? []).find((e) => e.id === args.p_id);
      if (entry) {
        entry.status = "confirmed";
        entry.was_confirmed = true;
        entry.confirmed_by = uid;
        entry.confirmed_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "edit_abono_entry": {
      const entry = (snapshot.abonoEntries ?? []).find((e) => e.id === args.p_id);
      if (entry) {
        if (args.p_delete) {
          entry.deleted_at = new Date().toISOString();
        } else {
          if (args.p_total_amount_centavos !== undefined)
            entry.total_amount_centavos = Number(args.p_total_amount_centavos);
          if (args.p_owed_amount_centavos !== undefined)
            entry.owed_amount_centavos = Number(args.p_owed_amount_centavos);
          if (args.p_description !== undefined)
            entry.description = (args.p_description as string).trim();
          if (args.p_note !== undefined)
            entry.note = (args.p_note as string).trim();
          if (args.p_entry_date !== undefined)
            entry.entry_date = args.p_entry_date as string;
        }
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "respond_delete_abono_entry": {
      const entry = (snapshot.abonoEntries ?? []).find((e) => e.id === args.p_id);
      if (entry) {
        entry.deleted_at = new Date().toISOString();
      }
      saveRawSoloSnapshot(snapshot);
      return true;
    }

    case "record_repayment":
    case "confirm_repayment":
    case "edit_repayment":
      return true;

    default:
      return null;
  }
}
