import { useState } from "react";
import { t, label } from "../i18n";
import type { Snapshot } from "../data";
import { rpc } from "../data";
import type { Run } from "../components/shared";
import { name } from "../components/shared";
import { money, shortDate } from "../helpers";
import Avatar from "../components/Avatar";

const PAGE = 20;
const manilaDay = (at: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(at),
  );
const manilaTime = (at: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(at));

export default function Changes({
  data,
  run,
  busy,
}: {
  data: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const [limit, setLimit] = useState(PAGE);
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
  const recent = [...data.changes].reverse();
  const shown = recent.slice(0, limit);
  // Group the visible changes by Manila calendar day, newest first.
  const days: { day: string; items: typeof shown }[] = [];
  for (const h of shown) {
    const day = manilaDay(h.created_at);
    if (days.at(-1)?.day === day) days.at(-1)!.items.push(h);
    else days.push({ day, items: [h] });
  }
  const yesterday = manilaDay(
    new Date(new Date(`${data.today}T12:00:00+08:00`).getTime() - 864e5),
  );
  const dayTitle = (day: string) =>
    day === data.today
      ? t("Today")
      : day === yesterday
        ? t("Yesterday")
        : shortDate(day);
  return (
    <>
      <div className="row">
        <h1>{t("Changes")}</h1>
        {recent.some((h) => h.unread) && (
          <button
            className="quiet"
            disabled={busy}
            onClick={() => run(() => rpc("mark_history_seen"))}
          >
            {t("Mark read")}
          </button>
        )}
      </div>
      {recent.length === 0 && (
        <div className="empty">
          <p>{t("No changes yet.")}</p>
        </div>
      )}
      {days.map(({ day, items }) => (
        <section key={day} className="change-day">
          <h2 className="section-label">{dayTitle(day)}</h2>
          {items.map((h) => (
            <details key={h.id} className="change-row">
              <summary>
                <Avatar data={data} id={h.actor_id} size="sm" />
                <span className="change-what">
                  <b>{name(data, h.actor_id).trim().split(/\s+/)[0]}</b>{" "}
                  {label(h.action)} {label(h.entity)}
                </span>
                {h.unread && (
                  <span className="change-new" aria-label={t("New")} />
                )}
                <time className="meta" dateTime={h.created_at}>
                  {manilaTime(h.created_at)}
                </time>
              </summary>
              {Object.entries(fields)
                .filter(([key]) => h.before?.[key] !== h.after?.[key])
                .map(([key, label]) => (
                  <p key={key}>
                    <strong>{label}</strong>
                    <br />
                    {value(key, h.before?.[key])} →{" "}
                    {value(key, h.after?.[key])}
                  </p>
                ))}
            </details>
          ))}
        </section>
      ))}
      {recent.length > limit && (
        <button
          className="secondary big"
          onClick={() => setLimit((n) => n + PAGE)}
        >
          {t("Show more")}
        </button>
      )}
    </>
  );
}
