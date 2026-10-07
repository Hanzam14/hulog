import type { Cycle, Snapshot } from "../data";
import { rpc } from "../data";
import { t } from "../i18n";
import { name, type Run } from "./shared";

export default function GivePayout({
  c,
  data,
  user,
  run,
  busy,
}: {
  c: Cycle;
  data: Snapshot;
  user: string;
  run: Run;
  busy: boolean;
}) {
  const active = data.memberships.filter(
    (m) => m.group_id === c.group_id && m.status === "active",
  );
  const other = active.find((m) => m.user_id !== user);
  if (
    c.receiver_id !== user ||
    !active.some((m) => m.user_id === user) ||
    !other ||
    c.status !== "accepted" ||
    c.received_at ||
    data.today > c.end_date
  )
    return null;
  const vars = { name: name(data, other.user_id) };
  return (
    <button
      className="quiet"
      disabled={busy}
      onClick={() => {
        if (window.confirm(t("Give this round’s payout to {name}?", vars)))
          void run(() => rpc("give_payout", { p_cycle_id: c.id }));
      }}
    >
      {t("Give to {name}", vars)}
    </button>
  );
}
