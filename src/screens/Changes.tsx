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
    name: "Group name",
    pot_location: "Pot held at",
    status: "Status",
    days: "Days",
    amount_centavos: "Amount",
    daily_amount_centavos: "Daily amount",
    num_days: "Cycle length",
    start_date: "Starts",
    end_date: "Ends",
    receiver_id: "Receiver",
    deleted_at: "Deleted",
    received_at: "Received",
    used_at: "Invite used",
    revoked_at: "Invite revoked",
  };
  const value = (key: string, v: unknown) =>
    v == null
      ? "—"
      : key.endsWith("_centavos")
        ? money(Number(v))
        : key === "receiver_id"
          ? name(data, String(v))
          : key.endsWith("_at")
            ? "Yes"
            : String(v);
  return (
    <>
      <div className="row">
        <h1>Changes</h1>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => run(() => rpc("mark_history_seen"))}
        >
          Mark read
        </button>
      </div>
      <p>Every correction leaves a record.</p>
      {[...data.changes].reverse().map((h) => (
        <section key={h.id}>
          <div className="row">
            <strong>
              {name(data, h.actor_id)} · {h.action} {h.entity}
            </strong>
            {h.unread && <span className="badge">New</span>}
          </div>
          <p>
            {new Intl.DateTimeFormat("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Manila",
            }).format(new Date(h.created_at))}{" "}
            Manila
          </p>
          <details>
            <summary>What changed</summary>
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
