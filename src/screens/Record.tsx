import { t } from "../i18n";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, heldByText, name, tone } from "../components/shared";
import { newRequestId, submitRecord, useQueueingOffline } from "../outbox";
import { money } from "../helpers";
import { cleanProofRef } from "../proofRef";
import { ProofRefField } from "../components/ProofRef";
import Avatar from "../components/Avatar";
import Tally from "../components/Tally";

/** Log today's hulog: pick how many days, see the stickers, send. */
export default function Record({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const [days, setDays] = useState(1);
  const [note, setNote] = useState("");
  const [proofRef, setProofRef] = useState("");
  const offline = useQueueingOffline();
  // One key per attempt: a double tap or a retry is recognised by the server.
  const requestId = useRef(newRequestId());
  const c = [...data.cycles]
    .sort(byNewest)
    .find((cycle) => cycle.status === "accepted" && !closed(cycle));
  if (!c)
    return (
      <p>
        {t("No open round.")} <Link to="/">{t("Go home")}</Link>
      </p>
    );
  const mine = data.progress.find(
    (p) => p.cycle_id === c.id && p.member_id === user,
  );
  const left = Math.max(
    1,
    c.num_days - (mine ? mine.confirmed_days + mine.pending_days : 0),
  );
  const set = (n: number) => setDays(Math.min(left, Math.max(1, n)));
  return (
    <div className="record">
      <Link to="/" className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <div className="member-who">
        <Avatar data={data} id={user} size="sm" />
        <strong>{name(data, user)}</strong>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day less")}
          onClick={() => set(days - 1)}
        >
          <IconMinus />
        </button>
        <output aria-live="polite" aria-label={t("Days")}>
          {days}
        </output>
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day more")}
          onClick={() => set(days + 1)}
        >
          <IconPlus />
        </button>
      </div>
      <Tally
        label={name(data, user)}
        paid={days}
        pending={0}
        total={days}
        tone={tone(data, user)}
        className="preview"
        decorative
      />
      <strong className="amount">
        {money(days * c.daily_amount_centavos)}
      </strong>
      {c.holder_id && c.wallet_label && (
        <p className="meta" style={{ textAlign: "center", margin: "4px 0" }}>
          {heldByText(data, c.holder_id, c.wallet_label, user)}
        </p>
      )}
      <input
        type="text"
        maxLength={140}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label={t("Note (optional)")}
        placeholder={t("Note (optional)")}
        style={{ textAlign: "center", maxWidth: "320px", margin: "8px auto" }}
      />
      <div style={{ maxWidth: "320px", margin: "8px auto", width: "100%" }}>
        <ProofRefField value={proofRef} onChange={setProofRef} />
      </div>
      <button
        className="big"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const payload: {
              p_cycle_id: string;
              p_days: number;
              p_note?: string;
              p_proof_ref?: string;
            } = {
              p_cycle_id: c.id,
              p_days: days,
            };
            const trimmed = note.trim();
            if (trimmed) {
              payload.p_note = trimmed;
            }
            const ref = cleanProofRef(proofRef);
            if (ref) payload.p_proof_ref = ref;
            const result = await submitRecord(user, {
              kind: "payment",
              args: payload,
              id: requestId.current,
            });
            requestId.current = newRequestId();
            navigate("/");
            return result;
          })
        }
      >
        {offline ? t("Save for now (offline)") : t("hulog!")}
      </button>
      {offline && (
        <p className="offline-hint" role="status">
          {t(
            "You're offline. This will be saved on this phone and sent when you're back online.",
          )}
        </p>
      )}
    </div>
  );
}
