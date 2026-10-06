import { useState } from "react";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import { load, rpc } from "../data";
import { csv } from "../helpers";
import NotificationSettings from "../components/NotificationSettings";

export default function Settings({ data, user, run, busy }: ViewProps) {
  const group = data.groups[0];
  const owner = group.owner_id === user;
  const [invite, setInvite] = useState("");
  const [qr, setQr] = useState("");
  const exportCsv = async () => {
    const fresh = await load();
    for (const [file, rows] of [
      ["cycles", fresh.cycles],
      ["payments", fresh.payments],
      ["repayments", fresh.repayments],
    ] as const) {
      const url = URL.createObjectURL(
        new Blob(
          ["\ufeff", csv(rows as unknown as Record<string, unknown>[])],
          { type: "text/csv;charset=utf-8" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `hulog-${file}.csv`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return (
    <>
      <h1>Our group</h1>
      <section>
        <h2>{group.name}</h2>
        <p>Pot held at: {group.pot_location || "Not set yet"}</p>
        {data.memberships
          .filter((m) => m.status === "active")
          .map((m) => (
            <p key={m.user_id}>
              <strong>{name(data, m.user_id)}</strong> ·{" "}
              {m.user_id === group.owner_id ? "Owner / holder" : "Member"}
            </p>
          ))}
        {owner && (
          <form
            key={group.pot_location}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                rpc("update_group", {
                  p_name: group.name,
                  p_pot_location: f.get("pot"),
                }),
              );
            }}
          >
            <label>
              Pot held at
              <input name="pot" defaultValue={group.pot_location} />
            </label>
            <button disabled={busy}>Save pot location</button>
          </form>
        )}
      </section>
      {owner && (
        <>
          <section>
            <h2>Invite your partner</h2>
            <p>
              One use, valid for 24 hours. A new link revokes older unused
              links.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const token = (await rpc("create_invite")) as string;
                  const link = `${window.location.origin}/join/${token}`;
                  setInvite(link);
                  const { default: QRCode } = await import("qrcode");
                  setQr(
                    await QRCode.toDataURL(link, { width: 240, margin: 2 }),
                  );
                })
              }
            >
              Create invite
            </button>
            {invite && (
              <div className="invite">
                {qr && (
                  <img
                    src={qr}
                    alt="Scan to join this Hulog group"
                    width="240"
                    height="240"
                  />
                )}
                <label>
                  Invite link
                  <input
                    readOnly
                    value={invite}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => navigator.clipboard.writeText(invite))
                  }
                >
                  Copy link
                </button>
              </div>
            )}
            {data.invites
              .filter((i) => !i.used_at && !i.revoked_at)
              .map((i) => (
                <div className="list-row" key={i.id}>
                  <p>
                    Expires{" "}
                    {new Intl.DateTimeFormat("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Manila",
                    }).format(new Date(i.expires_at))}
                  </p>
                  <button
                    className="quiet danger"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await rpc("revoke_invite", { p_id: i.id });
                        setInvite("");
                        setQr("");
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
          </section>
          <section>
            <h2>Join requests</h2>
            {!data.memberships.some((m) => m.status === "pending") && (
              <p>No requests right now.</p>
            )}
            {data.memberships
              .filter((m) => m.status === "pending")
              .map((m) => (
                <div className="entry" key={m.user_id}>
                  <p>
                    Join request from <strong>{name(data, m.user_id)}</strong> (
                    {data.profiles.find((p) => p.id === m.user_id)?.email})
                  </p>
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          rpc("review_member", {
                            p_user_id: m.user_id,
                            p_accept: true,
                          }),
                        )
                      }
                    >
                      Accept
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          rpc("review_member", {
                            p_user_id: m.user_id,
                            p_accept: false,
                          }),
                        )
                      }
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
          </section>
        </>
      )}
      <section>
        <h2>Keep a copy</h2>
        <p>
          Download cycles, payments and repayments as three CSV files. Amounts
          are in centavos.
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => run(exportCsv)}
        >
          Export CSV
        </button>
      </section>
      <NotificationSettings />
    </>
  );
}
