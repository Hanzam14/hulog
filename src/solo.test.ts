import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSoloSnapshot,
  setSoloPotMode,
  soloRpc,
} from "./solo";

describe("solo mode bug fixes", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Bug 1: respond_withdraw_goal honors action
  it("respond_withdraw_goal honors action: cancel and decline clear proposal without withdrawing, only confirm/accept withdraws", async () => {
    const snap = await loadSoloSnapshot();
    const goalId = (await soloRpc("propose_savings_goal", {
      p_title: "Vacation Fund",
      p_goal_mode: "flexible",
      p_target_amount_centavos: 500000,
      p_start_date: snap.today,
      p_end_date: snap.today,
    })) as string;

    // Simulate partner proposed withdrawal
    const raw = await loadSoloSnapshot();
    const goal = raw.savingsGoals!.find((g) => g.id === goalId)!;
    goal.withdraw_proposed_by = "partner-user";
    goal.pending_wallet_id = "partner-wallet";
    goal.wallet_proposed_by = "partner-user";

    // Action: decline
    await soloRpc("respond_withdraw_goal", {
      p_goal_id: goalId,
      p_action: "decline",
    });

    let updatedSnap = await loadSoloSnapshot();
    let updatedGoal = updatedSnap.savingsGoals!.find((g) => g.id === goalId)!;
    expect(updatedGoal.withdraw_proposed_by).toBeNull();
    expect(updatedGoal.withdrawn_at).toBeNull();
    expect(updatedGoal.withdrawn_by).toBeNull();

    // Re-propose withdrawal and test cancel
    updatedGoal.withdraw_proposed_by = "solo-user";
    await soloRpc("respond_withdraw_goal", {
      p_goal_id: goalId,
      p_action: "cancel",
    });

    updatedSnap = await loadSoloSnapshot();
    updatedGoal = updatedSnap.savingsGoals!.find((g) => g.id === goalId)!;
    expect(updatedGoal.withdraw_proposed_by).toBeNull();
    expect(updatedGoal.withdrawn_at).toBeNull();

    // Re-propose withdrawal and test confirm
    updatedGoal.withdraw_proposed_by = "partner-user";
    updatedGoal.pending_wallet_id = "partner-wallet";
    updatedGoal.wallet_proposed_by = "partner-user";
    await soloRpc("respond_withdraw_goal", {
      p_goal_id: goalId,
      p_action: "confirm",
    });

    updatedSnap = await loadSoloSnapshot();
    updatedGoal = updatedSnap.savingsGoals!.find((g) => g.id === goalId)!;
    expect(updatedGoal.withdraw_proposed_by).toBeNull();
    expect(updatedGoal.withdrawn_at).toBeTruthy();
    expect(updatedGoal.withdrawn_by).toBe("solo-user");
    expect(updatedGoal.pending_wallet_id).toBeNull();
    expect(updatedGoal.wallet_proposed_by).toBeNull();
  });

  // Bug 2: loadSoloSnapshot mirrors cycle_summary payout_state
  it("loadSoloSnapshot does not force Received or synthesize received_at for closed cycles where receiver is not wallet holder", async () => {
    const snap = await loadSoloSnapshot();
    // In default partnered pot, sharedCycle is open.
    // Let's create an accepted cycle that has ended (in the past), receiver is partnerId, wallet holder is uid.
    const partnerId = snap.memberships[1].user_id;
    const walletId = snap.wallets![0].id; // holder is uid

    const cycleId = (await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 2000,
      p_num_days: 5,
      p_start_date: "2026-01-01",
      p_receiver_id: partnerId,
      p_wallet_id: walletId,
    })) as string;

    const loaded = await loadSoloSnapshot();
    const cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.phase).toBe("ended");
    // Receiver is partnerId, wallet holder is uid -> should be "Waiting for Got it"
    expect(cycle.payout_state).toBe("Waiting for Got it");
    // Should NOT synthesize received_at
    expect(cycle.received_at).toBeNull();
  });

  // Bug 3: give_payout reassigns receiver to the other active member
  it("give_payout reassigns receiver to the other active member instead of caller", async () => {
    const snap = await loadSoloSnapshot();
    const uid = snap.memberships[0].user_id; // "solo-user"
    const partnerId = snap.memberships[1].user_id; // "partner-user"

    // Propose cycle with receiver = uid (caller)
    const cycleId = (await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 2000,
      p_num_days: 10,
      p_start_date: snap.today,
      p_receiver_id: uid,
    })) as string;

    let loaded = await loadSoloSnapshot();
    let cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.receiver_id).toBe(uid);

    // Current receiver (caller) hands off payout to other member
    await soloRpc("give_payout", { p_cycle_id: cycleId });

    loaded = await loadSoloSnapshot();
    cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.receiver_id).toBe(partnerId);
  });

  // Bug 4: repayments lifecycle enforces caps and reflects confirmed repayments in snapshot debt
  it("repayments lifecycle enforces caps and reflects confirmed repayments in snapshot debt", async () => {
    const snap = await loadSoloSnapshot();
    const uid = snap.memberships[0].user_id; // "solo-user"
    const partnerId = snap.memberships[1].user_id; // "partner-user"

    // Propose ended cycle where partner is receiver, uid is debtor
    const cycleId = (await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 1000,
      p_num_days: 10,
      p_start_date: "2026-01-01",
      p_receiver_id: partnerId,
    })) as string;

    // Record 4 days of payment for uid = 4000 centavos (expected is 10000, remaining debt is 6000)
    await soloRpc("record_payment", {
      p_cycle_id: cycleId,
      p_days: 4,
    });

    let loaded = await loadSoloSnapshot();
    let uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    const partnerProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === partnerId,
    )!;
    expect(uidProgress.debt_centavos).toBe(6000);
    expect(partnerProgress.debt_centavos).toBe(0);

    // Over-cap repayment should throw
    await expect(
      soloRpc("record_repayment", {
        p_cycle_id: cycleId,
        p_debtor_id: uid,
        p_amount_centavos: 7000,
      }),
    ).rejects.toThrow();

    // Valid repayment of 3000
    const repId = (await soloRpc("record_repayment", {
      p_cycle_id: cycleId,
      p_debtor_id: uid,
      p_amount_centavos: 3000,
    })) as string;
    expect(repId).toBeTruthy();

    loaded = await loadSoloSnapshot();
    let repayment = loaded.repayments.find((r) => r.id === repId)!;
    expect(repayment.status).toBe("pending");
    // Pending repayment does not reduce debt
    uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    expect(uidProgress.debt_centavos).toBe(6000);

    // Second repayment exceeding remaining cap (remaining cap is 6000 - 3000 = 3000)
    await expect(
      soloRpc("record_repayment", {
        p_cycle_id: cycleId,
        p_debtor_id: uid,
        p_amount_centavos: 4000,
      }),
    ).rejects.toThrow();

    // Confirm repayment
    await soloRpc("confirm_repayment", { p_id: repId });
    loaded = await loadSoloSnapshot();
    repayment = loaded.repayments.find((r) => r.id === repId)!;
    expect(repayment.status).toBe("confirmed");
    expect(repayment.was_confirmed).toBe(true);

    // Confirmed repayment reduces debt: 6000 - 3000 = 3000
    uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    expect(uidProgress.debt_centavos).toBe(3000);

    // Editing amount resets confirmed repayment to pending (Rule 9)
    await soloRpc("edit_repayment", {
      p_id: repId,
      p_amount_centavos: 2000,
    });
    loaded = await loadSoloSnapshot();
    repayment = loaded.repayments.find((r) => r.id === repId)!;
    expect(repayment.status).toBe("pending");
    expect(repayment.amount_centavos).toBe(2000);

    // Now that it's pending, debt is back to 6000
    uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    expect(uidProgress.debt_centavos).toBe(6000);

    // Reconfirm
    await soloRpc("confirm_repayment", { p_id: repId });
    loaded = await loadSoloSnapshot();
    uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    expect(uidProgress.debt_centavos).toBe(4000);

    // Delete repayment
    await soloRpc("edit_repayment", { p_id: repId, p_delete: true });
    loaded = await loadSoloSnapshot();
    repayment = loaded.repayments.find((r) => r.id === repId)!;
    expect(repayment.deleted_at).toBeTruthy();
    uidProgress = loaded.progress.find(
      (p) => p.cycle_id === cycleId && p.member_id === uid,
    )!;
    expect(uidProgress.debt_centavos).toBe(6000);
  });

  // Bug 5: respond_delete_savings_contribution handles confirm/accept, decline, and cancel
  it("respond_delete_savings_contribution handles confirm/accept, decline, and cancel", async () => {
    const snap = await loadSoloSnapshot();
    const goalId = (await soloRpc("propose_savings_goal", {
      p_title: "Holiday Savings",
      p_goal_mode: "flexible",
      p_target_amount_centavos: 100000,
      p_start_date: snap.today,
      p_end_date: snap.today,
    })) as string;

    const contribId = (await soloRpc("record_savings_contribution", {
      p_goal_id: goalId,
      p_amount_centavos: 10000,
    })) as string;

    // Simulate delete proposed
    let loaded = await loadSoloSnapshot();
    let contrib = loaded.savingsContributions!.find((c) => c.id === contribId)!;
    contrib.delete_proposed_by = "solo-user";

    // Action: cancel clears delete_proposed_by without deleting
    await soloRpc("respond_delete_savings_contribution", {
      p_id: contribId,
      p_action: "cancel",
    });
    loaded = await loadSoloSnapshot();
    contrib = loaded.savingsContributions!.find((c) => c.id === contribId)!;
    expect(contrib.delete_proposed_by).toBeNull();
    expect(contrib.deleted_at).toBeNull();

    // Action: decline clears delete_proposed_by without deleting
    contrib.delete_proposed_by = "partner-user";
    await soloRpc("respond_delete_savings_contribution", {
      p_id: contribId,
      p_action: "decline",
    });
    loaded = await loadSoloSnapshot();
    contrib = loaded.savingsContributions!.find((c) => c.id === contribId)!;
    expect(contrib.delete_proposed_by).toBeNull();
    expect(contrib.deleted_at).toBeNull();

    // Action: confirm soft-deletes contribution
    contrib.delete_proposed_by = "partner-user";
    await soloRpc("respond_delete_savings_contribution", {
      p_id: contribId,
      p_action: "confirm",
    });
    loaded = await loadSoloSnapshot();
    contrib = loaded.savingsContributions!.find((c) => c.id === contribId)!;
    expect(contrib.deleted_at).toBeTruthy();
    expect(contrib.delete_proposed_by).toBeNull();
  });

  // Bug 6: edit_payment resets confirmed payment to pending on days change but no-ops on unchanged days
  it("edit_payment resets confirmed payment to pending on days change but no-ops on unchanged days", async () => {
    let loaded = await loadSoloSnapshot();
    let payment = loaded.payments.find((p) => p.id === "pay-demo-1")!;
    expect(payment.status).toBe("confirmed");
    expect(payment.was_confirmed).toBe(true);
    expect(payment.days).toBe(3);

    // Unchanged days with new note -> no-op on status
    await soloRpc("edit_payment", {
      p_id: "pay-demo-1",
      p_days: 3,
      p_note: "Still 3 days",
    });
    loaded = await loadSoloSnapshot();
    payment = loaded.payments.find((p) => p.id === "pay-demo-1")!;
    expect(payment.status).toBe("confirmed");
    expect(payment.note).toBe("Still 3 days");

    // Changed days -> resets status to pending, clears confirmed_by/confirmed_at, keeps was_confirmed
    await soloRpc("edit_payment", {
      p_id: "pay-demo-1",
      p_days: 4,
    });
    loaded = await loadSoloSnapshot();
    payment = loaded.payments.find((p) => p.id === "pay-demo-1")!;
    expect(payment.days).toBe(4);
    expect(payment.amount_centavos).toBe(20000);
    expect(payment.status).toBe("pending");
    expect((payment as unknown as Record<string, unknown>).confirmed_by).toBeFalsy();
    expect((payment as unknown as Record<string, unknown>).confirmed_at).toBeFalsy();
    expect(payment.was_confirmed).toBe(true);
  });

  // Bug 7: wallet proposals (cycle and goal) follow spec 10.1/10.2
  it("cycle and goal wallet proposals require partner response unless same-holder move by holder", async () => {
    const snap = await loadSoloSnapshot();
    const uid = snap.memberships[0].user_id; // "solo-user"
    const partnerId = snap.memberships[1].user_id; // "partner-user"
    const initialWalletId = snap.wallets![0].id; // "solo-wallet", holder is uid
    const partnerWalletId = snap.wallets!.find((w) => w.holder_id === partnerId)!
      .id; // "partner-wallet"

    // Create a second wallet for uid
    const secondWalletId = (await soloRpc("create_wallet", {
      p_label: "Vault Pot",
    })) as string;

    // --- Part 1: Cycle wallet ---
    const cycleId = (await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 3000,
      p_num_days: 10,
      p_start_date: snap.today,
      p_wallet_id: initialWalletId,
    })) as string;

    // 1A. Same-holder move by holder -> immediate
    await soloRpc("propose_cycle_wallet", {
      p_cycle_id: cycleId,
      p_wallet_id: secondWalletId,
    });
    let loaded = await loadSoloSnapshot();
    let cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.wallet_id).toBe(secondWalletId);
    expect(cycle.pending_wallet_id).toBeNull();
    expect(cycle.wallet_proposed_by).toBeNull();

    // 1B. Different-holder move -> sets pending proposal
    await soloRpc("propose_cycle_wallet", {
      p_cycle_id: cycleId,
      p_wallet_id: partnerWalletId,
    });
    loaded = await loadSoloSnapshot();
    cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.wallet_id).toBe(secondWalletId); // NOT changed yet
    expect(cycle.pending_wallet_id).toBe(partnerWalletId);
    expect(cycle.wallet_proposed_by).toBe(uid);

    // 1C. Decline clears proposal
    await soloRpc("respond_cycle_wallet", {
      p_cycle_id: cycleId,
      p_action: "decline",
    });
    loaded = await loadSoloSnapshot();
    cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.wallet_id).toBe(secondWalletId);
    expect(cycle.pending_wallet_id).toBeNull();

    // 1D. Cancel clears proposal
    await soloRpc("propose_cycle_wallet", {
      p_cycle_id: cycleId,
      p_wallet_id: partnerWalletId,
    });
    await soloRpc("respond_cycle_wallet", {
      p_cycle_id: cycleId,
      p_action: "cancel",
    });
    loaded = await loadSoloSnapshot();
    cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.pending_wallet_id).toBeNull();

    // 1E. Accept applies proposal
    await soloRpc("propose_cycle_wallet", {
      p_cycle_id: cycleId,
      p_wallet_id: partnerWalletId,
    });
    await soloRpc("respond_cycle_wallet", {
      p_cycle_id: cycleId,
      p_action: "accept",
    });
    loaded = await loadSoloSnapshot();
    cycle = loaded.cycles.find((c) => c.id === cycleId)!;
    expect(cycle.wallet_id).toBe(partnerWalletId);
    expect(cycle.holder_id).toBe(partnerId);
    expect(cycle.pending_wallet_id).toBeNull();
    expect(cycle.wallet_proposed_by).toBeNull();

    // --- Part 2: Goal wallet ---
    const goalId = (await soloRpc("propose_savings_goal", {
      p_title: "Gadget Fund",
      p_goal_mode: "flexible",
      p_target_amount_centavos: 300000,
      p_start_date: snap.today,
      p_end_date: snap.today,
      p_wallet_id: initialWalletId,
    })) as string;

    // 2A. Same-holder move by holder -> immediate
    await soloRpc("propose_goal_wallet", {
      p_goal_id: goalId,
      p_wallet_id: secondWalletId,
    });
    loaded = await loadSoloSnapshot();
    let goal = loaded.savingsGoals!.find((g) => g.id === goalId)!;
    expect(goal.wallet_id).toBe(secondWalletId);
    expect(goal.pending_wallet_id).toBeNull();

    // 2B. Different-holder move -> sets pending proposal
    await soloRpc("propose_goal_wallet", {
      p_goal_id: goalId,
      p_wallet_id: partnerWalletId,
    });
    loaded = await loadSoloSnapshot();
    goal = loaded.savingsGoals!.find((g) => g.id === goalId)!;
    expect(goal.wallet_id).toBe(secondWalletId); // NOT changed yet
    expect(goal.pending_wallet_id).toBe(partnerWalletId);
    expect(goal.wallet_proposed_by).toBe(uid);

    // 2C. Decline clears proposal
    await soloRpc("respond_goal_wallet", {
      p_goal_id: goalId,
      p_action: "decline",
    });
    loaded = await loadSoloSnapshot();
    goal = loaded.savingsGoals!.find((g) => g.id === goalId)!;
    expect(goal.wallet_id).toBe(secondWalletId);
    expect(goal.pending_wallet_id).toBeNull();

    // 2D. Accept applies proposal
    await soloRpc("propose_goal_wallet", {
      p_goal_id: goalId,
      p_wallet_id: partnerWalletId,
    });
    await soloRpc("respond_goal_wallet", {
      p_goal_id: goalId,
      p_action: "accept",
    });
    loaded = await loadSoloSnapshot();
    goal = loaded.savingsGoals!.find((g) => g.id === goalId)!;
    expect(goal.wallet_id).toBe(partnerWalletId);
    expect(goal.holder_id).toBe(partnerId);
    expect(goal.pending_wallet_id).toBeNull();
  });

  // Bug 8: demo solo ai goal is seeded once and not re-injected after deletion
  it("demo solo ai goal is seeded once and not re-injected on pot mode switch after deletion", async () => {
    const snap = await loadSoloSnapshot();
    // Initially seeded: present in personalGoals or savingsGoals
    expect(
      snap.personalGoals?.some((g) => g.id === "demo-solo-ai-goal") ||
        snap.savingsGoals?.some((g) => g.id === "demo-solo-ai-goal"),
    ).toBe(true);

    // User removes/deletes the demo goal completely
    snap.personalGoals = (snap.personalGoals ?? []).filter(
      (g) => g.id !== "demo-solo-ai-goal",
    );
    snap.savingsGoals = (snap.savingsGoals ?? []).filter(
      (g) => g.id !== "demo-solo-ai-goal",
    );
    localStorage.setItem("hulog-solo-snapshot", JSON.stringify(snap));

    // Switch pot mode: standalone -> partnered
    setSoloPotMode("standalone");
    const switchedSnap = setSoloPotMode("partnered");

    // Must NOT re-inject demo-solo-ai-goal into savingsGoals or personalGoals
    expect(
      switchedSnap.savingsGoals?.some((g) => g.id === "demo-solo-ai-goal"),
    ).toBe(false);

    // Also test single-member upgrade at L608
    const singleSnap = setSoloPotMode("standalone");
    singleSnap.personalGoals = (singleSnap.personalGoals ?? []).filter(
      (g) => g.id !== "demo-solo-ai-goal",
    );
    singleSnap.savingsGoals = (singleSnap.savingsGoals ?? []).filter(
      (g) => g.id !== "demo-solo-ai-goal",
    );
    localStorage.setItem("hulog-solo-snapshot", JSON.stringify(singleSnap));

    // Set pot mode to partnered in localStorage without calling setSoloPotMode to trigger L608 upgrade branch in loadSoloSnapshot
    localStorage.setItem("hulog-solo-pot-mode", "partnered");
    const upgraded = await loadSoloSnapshot();
    expect(
      upgraded.savingsGoals?.some((g) => g.id === "demo-solo-ai-goal"),
    ).toBe(false);
    expect(
      upgraded.personalGoals?.some((g) => g.id === "demo-solo-ai-goal"),
    ).toBe(false);
  });
});
