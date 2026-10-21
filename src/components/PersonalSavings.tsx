import { useState, type FormEvent } from "react";
import {
  IconEye,
  IconLock,
  IconMinus,
  IconPlus,
  IconTarget,
} from "@tabler/icons-react";
import type { PersonalEntry, PersonalGoal } from "../data";
import { rpc } from "../data";
import { money, parsePesos, shortDate } from "../helpers";
import { t, label } from "../i18n";
import { isSoloMode } from "../solo";
import { personalBalance } from "../personal";
import { name, type Run, type ViewProps } from "./shared";

export function GoalForm({
  goal,
  busy,
  run,
  close,
}: {
  goal?: PersonalGoal;
  busy: boolean;
  run: Run;
  close: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await rpc(goal ? "update_personal_goal" : "create_personal_goal", {
        ...(goal ? { p_goal_id: goal.id } : {}),
        p_title: form.get("title"),
        p_target_amount_centavos: parsePesos(String(form.get("target"))),
        p_visibility: form.get("visibility"),
      });
      close();
    });
  };
  return (
    <form onSubmit={submit} className="personal-form">
      <label>
        {t("Goal title")}
        <input
          name="title"
          required
          maxLength={60}
          defaultValue={goal?.title}
        />
      </label>
      <label>
        {t("Personal target (₱)")}
        <input
          name="target"
          inputMode="decimal"
          required
          defaultValue={
            goal ? (goal.target_amount_centavos / 100).toFixed(2) : ""
          }
        />
      </label>
      <label>
        {t("Visibility")}
        <select name="visibility" defaultValue={goal?.visibility ?? "private"}>
          <option value="private">{t("Private — only you")}</option>
          <option value="shared">{t("Shared — partner can view")}</option>
        </select>
      </label>
      <p className="meta">
        {t("Only you can change this goal or its records.")}
      </p>
      <div className="actions">
        <button disabled={busy}>
          {goal ? t("Save goal") : t("Create personal goal")}
        </button>
        <button className="quiet" type="button" onClick={close}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
function EntryForm({
  goal,
  kind,
  entry,
  today,
  busy,
  run,
  close,
}: {
  goal: PersonalGoal;
  kind: PersonalEntry["kind"];
  entry?: PersonalEntry;
  today: string;
  busy: boolean;
  run: Run;
  close: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await rpc(entry ? "update_personal_entry" : "record_personal_entry", {
        ...(entry
          ? { p_entry_id: entry.id }
          : { p_goal_id: goal.id, p_kind: kind }),
        p_amount_centavos: parsePesos(String(form.get("amount"))),
        p_entry_date: form.get("date"),
        p_note: form.get("note"),
      });
      close();
    });
  };
  return (
    <form className="personal-form" onSubmit={submit}>
      <h3>
        {entry
          ? t("Edit personal entry")
          : kind === "deposit"
            ? t("Record deposit")
            : t("Record withdrawal")}
      </h3>
      <label>
        {t("Amount (₱)")}
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={entry ? (entry.amount_centavos / 100).toFixed(2) : ""}
        />
      </label>
      <label>
        {t("Date")}
        <input
          name="date"
          type="date"
          required
          max={today}
          defaultValue={entry?.entry_date ?? today}
        />
      </label>
      <label>
        {t("Note (optional)")}
        <input name="note" maxLength={140} defaultValue={entry?.note ?? ""} />
      </label>
      <p className="meta">
        {t("This records money you moved yourself. Hulog does not move money.")}
      </p>
      <div className="actions">
        <button disabled={busy}>
          {entry
            ? t("Save correction")
            : kind === "deposit"
              ? t("Record deposit")
              : t("Record withdrawal")}
        </button>
        <button className="quiet" type="button" onClick={close}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
export function PersonalGoalCard({
  goal,
  data,
  user,
  run,
  busy,
}: ViewProps & { goal: PersonalGoal }) {
  const owner = goal.owner_id === user;
  const entries = (data.personalEntries ?? [])
    .filter((e) => e.goal_id === goal.id && !e.deleted_at)
    .sort(
      (a, b) =>
        b.entry_date.localeCompare(a.entry_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const partnerId = data.memberships.find(
    (m) => m.status === "active" && m.user_id !== user,
  )?.user_id;
  const visibilityText =
    goal.visibility === "private"
      ? t("Private")
      : owner
        ? partnerId
          ? t("Visible to {name}", {
              name: name(data, partnerId).trim().split(/\s+/)[0],
            })
          : t("Visible to partner")
        : t("Shared read-only");
  const balance = personalBalance(entries, goal.id);
  const progress = Math.min(100, (balance / goal.target_amount_centavos) * 100);
  const [editingGoal, setEditingGoal] = useState(false);
  const [recording, setRecording] = useState<PersonalEntry["kind"] | null>(
    null,
  );
  const [editingEntry, setEditingEntry] = useState<PersonalEntry | null>(null);
  const remove = (entity: "goal" | "entry", id: string) => {
    if (
      window.confirm(
        t("Delete this personal savings record? It stays in your history."),
      )
    )
      void run(() =>
        rpc(
          entity === "goal" ? "update_personal_goal" : "update_personal_entry",
          {
            [entity === "goal" ? "p_goal_id" : "p_entry_id"]: id,
            p_delete: true,
          },
        ),
      );
  };
  return (
    <article className="pot ipon-card personal-goal" aria-label={goal.title}>
      <div className="row">
        <h3>
          <IconTarget size={20} aria-hidden="true" /> {goal.title}
        </h3>
        <span className="chip personal-visibility">
          {goal.visibility === "private" ? (
            <IconLock size={16} aria-hidden="true" />
          ) : (
            <IconEye size={16} aria-hidden="true" />
          )}
          {visibilityText}
        </span>
      </div>
      {!owner && (
        <p className="meta">
          {t("Personal savings by {name}", { name: name(data, goal.owner_id) })}
        </p>
      )}
      <div className="pot-amount">
        <strong>{money(balance)}</strong>
        <span className="pot-target">
          {t("of {amount}", { amount: money(goal.target_amount_centavos) })}
        </span>
      </div>
      <div
        className="pot-progress"
        role="progressbar"
        aria-label={t("Personal savings progress")}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      {owner ? (
        <>
          <button
            className="secondary personal-share"
            disabled={busy}
            onClick={() =>
              void run(() =>
                rpc("update_personal_goal", {
                  p_goal_id: goal.id,
                  p_visibility:
                    goal.visibility === "private" ? "shared" : "private",
                }),
              )
            }
          >
            {goal.visibility === "private" ? (
              <IconEye size={18} aria-hidden="true" />
            ) : (
              <IconLock size={18} aria-hidden="true" />
            )}
            {goal.visibility === "private"
              ? t("Share read-only")
              : t("Make private")}
          </button>
          <div className="actions">
            <button
              aria-label={t("Record deposit")}
              disabled={busy}
              onClick={() => {
                setRecording("deposit");
                setEditingEntry(null);
              }}
            >
              <IconPlus size={18} aria-hidden="true" /> {t("Add savings")}
            </button>
            <button
              className="secondary"
              aria-label={t("Record withdrawal")}
              disabled={busy || balance === 0}
              onClick={() => {
                setRecording("withdrawal");
                setEditingEntry(null);
              }}
            >
              <IconMinus size={18} aria-hidden="true" /> {t("Take out savings")}
            </button>
          </div>
          {recording && (
            <EntryForm
              key={editingEntry?.id ?? recording}
              goal={goal}
              entry={editingEntry ?? undefined}
              kind={recording}
              today={data.today}
              busy={busy}
              run={run}
              close={() => {
                setRecording(null);
                setEditingEntry(null);
              }}
            />
          )}
        </>
      ) : (
        <p className="meta">
          {t("Read-only. Only the owner can change these records.")}
        </p>
      )}
      <details>
        <summary>{t("Savings records")}</summary>
        {entries.length === 0 && (
          <p className="meta">
            {t("No entries yet. Record your first deposit.")}
          </p>
        )}
        {entries.map((entry) => (
          <div className="entry" key={entry.id}>
            <div className="row">
              <span>
                {entry.kind === "deposit" ? t("Deposit") : t("Withdrawal")}
              </span>
              <b className="personal-entry-amount">
                {money(entry.amount_centavos)}
              </b>
            </div>
            <p>
              {shortDate(entry.entry_date)}
              {entry.note && (
                <>
                  <br />
                  {entry.note}
                </>
              )}
            </p>
            {owner && (
              <div className="actions">
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    setEditingEntry(entry);
                    setRecording(entry.kind);
                  }}
                >
                  {t("Edit personal entry")}
                </button>
                <button
                  className="quiet danger"
                  disabled={busy}
                  onClick={() => remove("entry", entry.id)}
                >
                  {t("Delete entry")}
                </button>
              </div>
            )}
          </div>
        ))}
      </details>
      {owner && (
        <details>
          <summary>{t("Manage personal goal")}</summary>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setEditingGoal(!editingGoal)}
            >
              {t("Edit goal")}
            </button>
            <button
              className="quiet danger"
              disabled={busy}
              onClick={() => remove("goal", goal.id)}
            >
              {t("Delete goal")}
            </button>
          </div>
          {editingGoal && (
            <GoalForm
              goal={goal}
              run={run}
              busy={busy}
              close={() => setEditingGoal(false)}
            />
          )}
        </details>
      )}
    </article>
  );
}
export default function PersonalSavings(props: ViewProps) {
  const [creating, setCreating] = useState(false);
  const goals = (props.data.personalGoals ?? []).filter(
    (g) =>
      !g.deleted_at && (g.owner_id === props.user || g.visibility === "shared"),
  );
  return (
    <section
      className="personal-savings"
      id="personal-savings"
      aria-labelledby="personal-savings-title"
    >
      <h2 id="personal-savings-title">{t("Personal savings")}</h2>
      <p className="meta">
        {isSoloMode()
          ? t("On this device only. Sign in to sync personal savings.")
          : t(
              "Your goals sync to your account. Private unless you choose to share.",
            )}
      </p>
      {goals.map((goal) => (
        <PersonalGoalCard key={goal.id} goal={goal} {...props} />
      ))}
      {creating ? (
        <GoalForm
          run={props.run}
          busy={props.busy}
          close={() => setCreating(false)}
        />
      ) : (
        <button
          className="secondary"
          disabled={props.busy}
          onClick={() => setCreating(true)}
        >
          <IconPlus size={18} aria-hidden="true" /> {t("New personal goal")}
        </button>
      )}
      {(props.data.personalHistory ?? []).some(
        (h) => h.actor_id === props.user,
      ) && (
        <details className="personal-history">
          <summary>{t("Personal savings history")}</summary>
          {[...(props.data.personalHistory ?? [])]
            .filter((h) => h.actor_id === props.user)
            .sort((a, b) => b.id - a.id)
            .map((change) => (
              <div className="entry" key={change.id}>
                <b>
                  {
                    props.data.personalGoals?.find(
                      (g) => g.id === change.goal_id,
                    )?.title
                  }
                </b>
                <p>
                  {label(change.action)}{" "}
                  {change.entity === "personal_savings_goals"
                    ? t("Goal")
                    : t("Savings entry")}
                  <br />
                  {new Date(change.created_at).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                  })}
                </p>
                {typeof change.after?.amount_centavos === "number" && (
                  <p>{money(change.after.amount_centavos)}</p>
                )}
                {typeof change.after?.note === "string" &&
                  change.after.note && <p>{change.after.note}</p>}
              </div>
            ))}
        </details>
      )}
    </section>
  );
}
