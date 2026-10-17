import { t, label } from "../i18n";
import type { Snapshot } from "../data";
import { rpc } from "../data";
import type { Run } from "../components/shared";
import { name } from "../components/shared";
import { money } from "../helpers";

export default function Changes({
  data,
  run,
  busy,
}: {
  data: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const fields: Record<string, string> = {
    name: t("Group name"),
    pot_location: t("Pot held at"),
    status: t("Status"),
    days: t("Days"),
    amount_centavos: t("Amount"),
    daily_amount_centavos: t("Daily amount"),
    num_days: t("Cycle length"),
    start_date: t("Starts"),
    end_date: t("Ends"),
    receiver_id: t("Receiver"),
    deleted_at: t("Deleted"),
    received_at: t("Received"),
    used_at: t("Invite used"),
    revoked_at: t("Invite revoked"),
    label: t("Wallet name (e.g. SeaBank, GCash, Cash)"),
    title: t("Goal title"),
    goal_mode: t("Goal mode"),
    target_amount_centavos: t("Target amount (₱)"),
    step_amount_centavos: t("Amount per hulog (₱)"),
    cadence_days: t("Every how many days?"),
    num_steps: t("Number of hulogs"),
    steps: t("steps"),
    description: t("What was it for?"),
    total_amount_centavos: t("Total receipt (₱)"),
    owed_amount_centavos: t("Partner's share (₱)"),
    from_member: t("Who paid?"),
    to_member: t("Member"),
    holder_id: t("Wallet is held by"),
    wallet_id: t("wallets"),
    withdrawn_at: t("Withdrawn"),
    archived_at: t("Archive wallet"),
    note: t("Note or ref # (optional)"),
  };
  const value = (key: string, v: unknown) =>
    v == null
      ? "—"
      : key.endsWith("_centavos")
        ? money(Number(v))
        : ["receiver_id", "holder_id", "from_member", "to_member"].includes(key)
          ? name(data, String(v))
          : key === "wallet_id"
            ? ((data.wallets ?? []).find((w) => w.id === v)?.label ?? String(v))
            : key.endsWith("_at")
              ? t("Yes")
              : label(String(v));
  return (
    <>
      <div className="row">
        <h1>{t("Changes")}</h1>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => run(() => rpc("mark_history_seen"))}
        >
          {t("Mark read")}
        </button>
      </div>
      {[...data.changes].reverse().map((h) => (
        <section key={h.id}>
          <div className="row">
            <strong>
              {name(data, h.actor_id)} · {label(h.action)} {label(h.entity)}
            </strong>
            {h.unread && <span className="badge">{t("New")}</span>}
          </div>
          <p>
            {new Intl.DateTimeFormat("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Manila",
            }).format(new Date(h.created_at))}{" "}
            {t("Manila")}
          </p>
          <details>
            <summary>{t("What changed")}</summary>
            {Object.entries(fields)
              .filter(([key]) => h.before?.[key] !== h.after?.[key])
              .map(([key, label]) => (
                <p key={key}>
                  <strong>{label}</strong>
                  <br />
                  {value(key, h.before?.[key])} → {value(key, h.after?.[key])}
                </p>
              ))}
          </details>
        </section>
      ))}
    </>
  );
}
