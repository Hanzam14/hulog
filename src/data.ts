import { createClient } from "@supabase/supabase-js";
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
}
export interface Payment {
  id: string;
  cycle_id: string;
  member_id: string;
  days: number;
  amount_centavos: number;
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
}
export async function rpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
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
    if (error) throw new Error(error.message);
    all.push(...(data as T[]));
    if (data.length < 1000) return all;
  }
}
export async function load(): Promise<Snapshot> {
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
  };
}
