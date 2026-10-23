import { t, label } from "../i18n";
import type { ViewProps } from "./shared";
import { money } from "../helpers";
import {
  flushOutbox,
  discardItem,
  retryItem,
  useOffline,
  useOutbox,
} from "../outbox";
import type { OutboxItem } from "../outbox";
import { isSoloMode } from "../solo";

/** Plain-words summary of a waiting entry, from its saved arguments. */
function describe(item: OutboxItem, data: ViewProps["data"]): string {
  if (item.kind === "payment") {
    const days = Number(item.args.p_days) || 0;
    const cycle = data.cycles.find((c) => c.id === item.args.p_cycle_id);
    const daysText = t("{days} days", { days });
    return cycle
      ? `${daysText} · ${money(days * cycle.daily_amount_centavos)}`
      : daysText;
  }
  const description = String(item.args.p_description ?? "").trim();
  const owed =
    Number(item.args.p_owed_amount_centavos) ||
    Number(item.args.p_total_amount_centavos) ||
    0;
  return `${description ? `${description} · ` : ""}${money(owed)}`;
}

/**
 * Records saved on this phone that the server has not written yet. They are
 * never part of the pot, debt or totals; this strip is the only place they show.
 */
export default function OutboxStrip({ data, user, run, busy }: ViewProps) {
  const items = useOutbox(isSoloMode() ? null : user);
  const offline = useOffline();
  if (items.length === 0) return null;
  const failed = items.filter((item) => item.state === "failed");
  const waiting = items.length - failed.length;
  return (
    <section className="outbox-strip" aria-live="polite">
      <div className="outbox-head">
        <strong>{t("{count} not synced yet", { count: items.length })}</strong>
        <button
          type="button"
          className="secondary"
          disabled={busy || offline || waiting === 0}
          onClick={() =>
            void run(
              async () => {
                await flushOutbox(user);
              },
              { showSuccess: false },
            )
          }
        >
          {t("Sync now")}
        </button>
      </div>
      {failed.map((item) => (
        <div className="outbox-item" key={item.id}>
          <div>
            <strong>{describe(item, data)}</strong>
            <small>
              {t("Could not sync")}
              {item.error ? `: ${label(item.error)}` : ""}
            </small>
          </div>
          <button
            type="button"
            className="quiet"
            disabled={busy || offline}
            onClick={() => {
              retryItem(user, item.id);
              void run(
                async () => {
                  await flushOutbox(user);
                },
                { showSuccess: false },
              );
            }}
          >
            {t("Try again")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => discardItem(user, item.id)}
          >
            {t("Discard")}
          </button>
        </div>
      ))}
    </section>
  );
}
