import type { Cycle, Snapshot } from "../data";
import { rpc } from "../data";
import { t } from "../i18n";
import type { Run } from "./shared";
import { canCloseEarly } from "./closeEarlyRule";

/** Quiet link to end a fully funded round before its last day. */
export default function CloseEarly({
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
  if (!canCloseEarly(c, data, user)) return null;
  return (
    <button
      className="quiet"
      disabled={busy}
      onClick={() => {
        if (
          window.confirm(
            t(
              "Close this round now? Payout can happen today. This can't be undone.",
            ),
          )
        )
          void run(() => rpc("close_cycle_early", { p_cycle_id: c.id }));
      }}
    >
      {t("Close round early")}
    </button>
  );
}
