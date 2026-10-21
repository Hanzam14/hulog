import { t } from "../i18n";
import { useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconMapPin,
  IconQrcode,
  IconShare,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import { load, rpc } from "../data";
import { csv } from "../helpers";
import NotificationSettings from "../components/NotificationSettings";
import Avatar from "../components/Avatar";
import ProfileEditor from "../components/ProfileEditor";
import ThemeSettings from "../components/ThemeSettings";
import InstallSettings from "../components/InstallSettings";
import AppUpdates from "../components/AppUpdates";
import LanguageSettings from "../components/LanguageSettings";
import WalletsSettings from "../components/WalletsSettings";
import CustodyCard from "../components/CustodyCard";
import { isSoloMode, setSoloMode, setSoloPotMode } from "../solo";

export default function Settings({
  data,
  user,
  run,
  busy,
  onSignOut,
}: ViewProps & { onSignOut?: () => void }) {
  const group = data.groups[0];
  const owner = group.owner_id === user;
  const [invite, setInvite] = useState("");
  const [qr, setQr] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const active = data.memberships.filter((m) => m.status === "active");
  const pending = data.memberships.filter((m) => m.status === "pending");
  // A used or revoked token must not keep showing its QR code.
  const openInvite = data.invites.some((i) => !i.used_at && !i.revoked_at);
  const exportCsv = async () => {
    const fresh = await load();
    const coreTables: [string, unknown[]][] = [
      ["cycles", fresh.cycles],
      ["payments", fresh.payments],
      ["repayments", fresh.repayments],
    ];
    const optionalTables: [string, unknown[]][] = [
      ["wallets", fresh.wallets ?? []],
      ["savings-goals", fresh.savingsGoals ?? []],
      ["savings-contributions", fresh.savingsContributions ?? []],
      ["abono-entries", fresh.abonoEntries ?? []],
    ];
    const tables = [
      ...coreTables,
      ...optionalTables.filter(([, rows]) => rows.length > 0),
    ];
    for (const [file, rows] of tables) {
      const url = URL.createObjectURL(
        new Blob(
          ["\ufeff", csv(rows as unknown as Record<string, unknown>[])],
          {
            type: "text/csv;charset=utf-8",
          },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `hulog-${file}.csv`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  const share = () =>
    run(async () => {
      if (navigator.share)
        await navigator.share({ title: t("Join our hulog"), url: invite });
      else await navigator.clipboard.writeText(invite);
    });
  return (
    <div className="settings-grid">
      <h1 className="sr-only">{group.name}</h1>
      <h2 className="section-label settings-title">{t("Grupo")}</h2>
      <div className="duo">
        {active.map((m) => (
          <figure key={m.user_id}>
            {m.user_id === user ? (
              <button
                type="button"
                className="avatar-edit"
                aria-label={t("I-edit ang profile mo")}
                aria-expanded={editingProfile}
                disabled={busy}
                onClick={() => setEditingProfile(!editingProfile)}
              >
                <Avatar data={data} id={m.user_id} size="lg" />
              </button>
            ) : (
              <Avatar data={data} id={m.user_id} size="lg" />
            )}
            <figcaption>{name(data, m.user_id)}</figcaption>
          </figure>
        ))}
      </div>
      {editingProfile && (
        <ProfileEditor
          data={data}
          user={user}
          run={run}
          busy={busy}
          close={() => setEditingProfile(false)}
        />
      )}
      {owner && (
        <form
          className="group-name"
          key={group.name}
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            void run(() =>
              rpc("update_group", {
                p_name: fields.get("group-name"),
                p_pot_location: group.pot_location,
              }),
            );
          }}
        >
          <label>
            {t("Pangalan ng grupo")}
            <input name="group-name" defaultValue={group.name} required />
          </label>
          <button
            className="round"
            aria-label={t("Save group name")}
            disabled={busy}
          >
            <IconCheck />
          </button>
        </form>
      )}
      {owner ? (
        <form
          className="pot-place"
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
          <IconMapPin aria-hidden="true" />
          <input
            name="pot"
            aria-label={t("Pot held at")}
            placeholder={t("where's the pot?")}
            defaultValue={group.pot_location}
          />
          <button className="round" aria-label={t("Save")} disabled={busy}>
            <IconCheck />
          </button>
        </form>
      ) : (
        group.pot_location && (
          <p className="place">
            <IconMapPin size={16} aria-label={t("Pot held at")} />{" "}
            {group.pot_location}
          </p>
        )
      )}
      <CustodyCard data={data} />
      <WalletsSettings data={data} user={user} run={run} busy={busy} />
      {isSoloMode() && (
        <div className="segmented" role="radiogroup" aria-label={t("Pot mode")}>
          <button
            type="button"
            role="radio"
            aria-checked={active.length > 1}
            aria-pressed={active.length > 1}
            aria-label={t("Partnered Pot (with Solo & Shared goals)")}
            onClick={() => {
              setSoloPotMode("partnered", user);
              void run(async () => {});
            }}
          >
            {t("Together")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={active.length <= 1}
            aria-pressed={active.length <= 1}
            aria-label={t("Standalone Solo")}
            onClick={() => {
              setSoloPotMode("standalone", user);
              void run(async () => {});
            }}
          >
            {t("Solo")}
          </button>
        </div>
      )}
      {isSoloMode() && (
        <p className="meta">
          {t("On this device only. Sign in to sync personal savings.")}
        </p>
      )}
      {active.length < 2 && (
        <div className="solo-mode-settings">
          {isSoloMode() ? (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setSoloMode(false);
                })
              }
            >
              {t("Exit solo mode")}
            </button>
          ) : (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setSoloMode(true, user);
                })
              }
            >
              {t("Switch to solo mode")}
            </button>
          )}
        </div>
      )}
      {owner && (
        <>
          {pending.map((m) => (
            <div className="sticker confirm" key={m.user_id}>
              <Avatar data={data} id={m.user_id} />
              <div>
                <strong>{name(data, m.user_id)}</strong>
                <small>
                  {data.profiles.find((p) => p.id === m.user_id)?.email}
                </small>
              </div>
              <button
                className="round no"
                aria-label={t("Deny {name}", { name: name(data, m.user_id) })}
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
                <IconX />
              </button>
              <button
                className="round ok"
                aria-label={t("Let {name} in", { name: name(data, m.user_id) })}
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
                <IconCheck />
              </button>
            </div>
          ))}
          {active.length < 2 && pending.length === 0 && (
            <div className="invite">
              {invite && openInvite ? (
                <>
                  {qr && (
                    <img
                      className="qr"
                      src={qr}
                      alt={t("Scan to join this Hulog group")}
                      width="220"
                      height="220"
                    />
                  )}
                  <div className="answer">
                    <button
                      className="round"
                      aria-label={t("Share invite link")}
                      disabled={busy}
                      onClick={share}
                    >
                      <IconShare />
                    </button>
                    <button
                      className="round secondary"
                      aria-label={t("Copy invite link")}
                      disabled={busy}
                      onClick={() =>
                        run(async () => navigator.clipboard.writeText(invite))
                      }
                    >
                      <IconCopy />
                    </button>
                  </div>
                  <span className="muted center">
                    {t("one use · 24 hours")}
                  </span>
                </>
              ) : (
                <button
                  className="big"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const token = (await rpc("create_invite")) as string;
                      const link = `${window.location.origin}/join/${token}`;
                      setInvite(link);
                      const { default: QRCode } = await import("qrcode");
                      setQr(
                        await QRCode.toDataURL(link, {
                          width: 440,
                          margin: 1,
                        }),
                      );
                    })
                  }
                >
                  <IconQrcode aria-hidden="true" /> {t("invite")}
                </button>
              )}
              {data.invites
                .filter((i) => !i.used_at && !i.revoked_at)
                .map((i) => (
                  <button
                    key={i.id}
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
                    <IconTrash size={14} aria-hidden="true" />{" "}
                    {t("revoke link")}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      <h2 className="section-label settings-title">{t("App")}</h2>
      <ThemeSettings />
      <LanguageSettings />
      <InstallSettings />
      <NotificationSettings />
      <h2 className="section-label settings-title">{t("More")}</h2>
      <button
        className="secondary export"
        disabled={busy}
        onClick={() => run(exportCsv)}
      >
        <IconDownload size={18} aria-hidden="true" /> {t("CSV")}
      </button>
      <AppUpdates />
      {onSignOut && (
        <button className="quiet" disabled={busy} onClick={onSignOut}>
          {t("Sign out")}
        </button>
      )}
    </div>
  );
}
