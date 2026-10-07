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
  };
  const value = (key: string, v: unknown) =>
    v == null
      ? "—"
      : key.endsWith("_centavos")
        ? money(Number(v))
        : key === "receiver_id"
          ? name(data, String(v))
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
