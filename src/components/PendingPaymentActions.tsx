import { IconCheck, IconX } from "@tabler/icons-react";
import { rpc } from "../data";
import { money } from "../helpers";
import { t } from "../i18n";
import type { Run } from "./shared";

export default function PendingPaymentActions({
  id,
  memberName,
  amount,
  allowed,
  busy,
  run,
}: {
  id: string;
  memberName: string;
  amount: number;
  allowed: boolean;
  busy: boolean;
  run: Run;
}) {
  const vars = { name: memberName, amount: money(amount) };
  return (
    <>
      <button
        className="round no"
        aria-label={t("Decline {name}'s {amount}", vars)}
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              t("Decline {name}'s {amount} hulog? It will be removed.", vars),
            )
          )
            void run(() => rpc("edit_payment", { p_id: id, p_delete: true }));
        }}
      >
        <IconX />
      </button>
      {allowed && (
        <button
          className="round ok"
          aria-label={t("Confirm {name}'s {amount}", vars)}
          disabled={busy}
          onClick={() => run(() => rpc("confirm_payment", { p_id: id }))}
        >
          <IconCheck />
        </button>
      )}
    </>
  );
}
