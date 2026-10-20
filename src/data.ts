import { createClient } from "@supabase/supabase-js";
import { isSoloMode, loadSoloSnapshot, soloRpc } from "./solo";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  nickname: string | null;
  avatar_kind: "initial" | "emoji" | "photo";
  avatar_emoji: string | null;
  color: "auto" | "pink" | "blue" | "green" | "orange" | "purple";
}
export interface Group {
  id: string;
  name: string;
  owner_id: string;
  pot_location: string;
}
export interface Membership {
  group_id: string;
  user_id: string;
  status: "pending" | "active" | "denied" | "removed";
  last_seen_history_at: string;
}
export interface Cycle {
  id: string;
  group_id: string;
  daily_amount_centavos: number;
  num_days: number;
  start_date: string;
  end_date: string;
  receiver_id: string;
  proposed_by: string;
  status: string;
  phase: string;
  pot_centavos: number;
  target_centavos: number;
  payout_state: string | null;
  received_at: string | null;
  days_left: number;
  created_at: string;
  wallet_id?: string;
  holder_id?: string;
  wallet_label?: string;
  pending_wallet_id?: string | null;
  wallet_proposed_by?: string | null;
}
export interface Payment {
  id: string;
  cycle_id: string;
  member_id: string;
  days: number;
  amount_centavos: number;
  note?: string;
  status: string;
  was_confirmed: boolean;
  created_at: string;
  deleted_at: string | null;
}
export interface Repayment {
  id: string;
  cycle_id: string;
  debtor_id: string;
  creditor_id: string;
  amount_centavos: number;
  status: string;
  was_confirmed: boolean;
  deleted_at: string | null;
}
export interface Progress {
  cycle_id: string;
  member_id: string;
  expected_centavos: number;
  confirmed_days: number;
  pending_days: number;
  pending_count: number;
  debt_centavos: number;
}
export interface Change {
  id: number;
  actor_id: string;
  entity: string;
  entity_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  unread: boolean;
}
export interface Wallet {
  id: string;
  group_id: string;
  holder_id: string;
  label: string;
  archived_at: string | null;
  created_by: string;
  created_at: string;
}
export interface CustodyItem {
  wallet_id: string;
  group_id: string;
  holder_id: string;
  label: string;
  archived_at: string | null;
  holder_active: boolean;
  paluwagan_centavos: number;
  ipon_centavos: number;
  total_centavos: number;
}
export interface SavingsGoal {
  id: string;
  group_id: string;
  title: string;
  goal_mode: "matched" | "flexible";
  wallet_id: string;
  holder_id: string;
  wallet_label: string;
  pending_wallet_id: string | null;
  wallet_proposed_by: string | null;
  target_amount_centavos: number;
  step_amount_centavos: number | null;
  cadence_days: number | null;
  num_steps: number | null;
  start_date: string;
  end_date: string;
  proposed_by: string;
  status: string;
  accepted_by: string | null;
  accepted_at: string | null;
  withdraw_proposed_by: string | null;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
  saved_centavos: number;
  phase: string;
  days_left: number;
  expected_steps_today: number;
  created_at: string;
}
export interface SavingsContribution {
  id: string;
  goal_id: string;
  member_id: string;
  steps: number | null;
  amount_centavos: number;
  note: string;
  status: string;
  was_confirmed: boolean;
  created_by: string;
  last_edited_by: string | null;
  delete_proposed_by: string | null;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
}
export interface SavingsMemberProgress {
  goal_id: string;
  member_id: string;
  expected_centavos: number;
  confirmed_centavos: number;
  pending_centavos: number;
  confirmed_steps: number;
  pending_steps: number;
}
export interface AbonoEntry {
  id: string;
  group_id: string;
  kind: "expense" | "settlement";
  from_member: string;
  to_member: string;
  description: string;
  total_amount_centavos: number;
  owed_amount_centavos: number;
  entry_date: string;
  note: string;
  status: string;
  was_confirmed: boolean;
  created_by: string;
  last_edited_by: string | null;
  delete_proposed_by: string | null;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
}
export interface AbonoSummary {
  group_id: string;
  debtor_id: string;
  creditor_id: string;
  owed_centavos: number;
  pending_settlement_centavos: number;
}
export interface Snapshot {
  profiles: Profile[];
  groups: Group[];
  memberships: Membership[];
  cycles: Cycle[];
  payments: Payment[];
  repayments: Repayment[];
  progress: Progress[];
  changes: Change[];
  invites: {
    id: string;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
  }[];
  today: string;
  wallets?: Wallet[];
  custody?: CustodyItem[];
  savingsGoals?: SavingsGoal[];
  savingsContributions?: SavingsContribution[];
  savingsProgress?: SavingsMemberProgress[];
  abonoEntries?: AbonoEntry[];
  abonoSummary?: AbonoSummary[];
}
export async function rpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  if (isSoloMode()) return soloRpc(name, args);
  if (!supabase) throw new Error("Add your Supabase settings in .env first.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
async function rows<T>(
  table: string,
  order: string,
  columns = "*",
): Promise<T[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const all: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order)
      .range(offset, offset + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    all.push(...(data as T[]));
    if (data.length < 1000) return all;
  }
}
export async function optionalRows<T>(
  table: string,
  order: string,
  columns = "*",
): Promise<T[]> {
  try {
    return await rows<T>(table, order, columns);
  } catch (error) {
    // Only a not-yet-deployed v2 relation is optional; other failures must not
    // render as empty balances.
    const code = (error as { code?: string }).code;
    if (code === "PGRST205" || code === "42P01") return [];
    throw error;
  }
}
export async function load(): Promise<Snapshot> {
  if (isSoloMode()) return loadSoloSnapshot();
  const [
    profiles,
    groups,
    memberships,
    cycles,
    payments,
    repayments,
    progress,
    changes,
    invites,
    today,
    wallets,
    custody,
    savingsGoals,
    savingsContributions,
    savingsProgress,
    abonoEntries,
    abonoSummary,
  ] = await Promise.all([
    rows<Profile>(
      "profiles",
      "id",
      "id,display_name,email,avatar_url,nickname,avatar_kind,avatar_emoji,color",
    ),
    rows<Group>("groups", "id"),
    rows<Membership>("memberships", "user_id"),
    rows<Cycle>("cycle_summary", "id"),
    rows<Payment>("payments", "id"),
    rows<Repayment>("repayments", "id"),
    rows<Progress>("member_progress", "cycle_id"),
    rows<Change>("history_changes", "id"),
    rows<Snapshot["invites"][number]>("invites", "id"),
    rpc("hulog_today"),
    optionalRows<Wallet>("wallets", "id"),
    optionalRows<CustodyItem>("custody_summary", "wallet_id"),
    optionalRows<SavingsGoal>("savings_goal_summary", "id"),
    optionalRows<SavingsContribution>("savings_contributions", "id"),
    optionalRows<SavingsMemberProgress>("savings_member_progress", "goal_id"),
    optionalRows<AbonoEntry>("abono_entries", "id"),
    optionalRows<AbonoSummary>("abono_summary", "debtor_id"),
  ]);
  return {
    profiles,
    groups,
    memberships,
    cycles,
    payments,
    repayments,
    progress,
    changes,
    invites,
    today: today as string,
    wallets,
    custody,
    savingsGoals,
    savingsContributions,
    savingsProgress,
    abonoEntries,
    abonoSummary,
  };
}
