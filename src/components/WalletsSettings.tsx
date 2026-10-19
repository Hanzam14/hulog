import { useState } from "react";
import type { FormEvent } from "react";
import { IconArchive, IconPencil, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "./shared";
import { name } from "./shared";
import type { Wallet } from "../data";
import { rpc } from "../data";
import { t } from "../i18n";
import Avatar from "./Avatar";

/** Settings section for viewing, adding, renaming, and archiving named wallets. */
export default function WalletsSettings({ data, user, run, busy }: ViewProps) {
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const wallets = (data.wallets ?? []).filter((w) => !w.archived_at);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    void run(async () => {
      await rpc("create_wallet", { p_label: trimmed });
      setNewLabel("");
    });
  };

  const handleRename = (w: Wallet) => (e: FormEvent) => {
    e.preventDefault();
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    void run(async () => {
      await rpc("update_wallet", {
        p_id: w.id,
        p_label: trimmed,
        p_archive: false,
      });
      setEditingId(null);
    });
  };

  const handleArchive = (w: Wallet) => () => {
    void run(() =>
      rpc("update_wallet", {
        p_id: w.id,
        p_label: w.label,
        p_archive: true,
      }),
    );
  };

  return (
    <section className="wallets-section">
      <h2>{t("Wallets & accounts")}</h2>
      <div className="wallets-list">
        {wallets.map((w) => {
          const isOwner = w.holder_id === user;
          const isEditing = editingId === w.id;

          return (
            <article className="entry" key={w.id}>
              {isEditing ? (
                <form
                  onSubmit={handleRename(w)}
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    margin: "4px 0",
                  }}
                >
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    aria-label={t("Rename wallet")}
                    placeholder={t("Wallet name (e.g. SeaBank, GCash, Cash)")}
                    maxLength={40}
                    required
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button type="submit" disabled={busy}>
                    {t("Save")}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    {t("Dismiss")}
                  </button>
                </form>
              ) : (
                <div className="row">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Avatar data={data} id={w.holder_id} size="sm" />
                    <span style={{ fontWeight: 600 }}>
                      {name(data, w.holder_id)}
                    </span>
                    <span className="chip" style={{ fontWeight: 700 }}>
                      {w.label}
                    </span>
                  </div>
                  {isOwner && (
                    <div className="actions" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy}
                        aria-label={t("Rename wallet")}
                        title={t("Rename wallet")}
                        onClick={() => {
                          setEditingId(w.id);
                          setEditLabel(w.label);
                        }}
                      >
                        <IconPencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="quiet danger"
                        disabled={busy}
                        onClick={handleArchive(w)}
                        title={t("Archive wallet")}
                      >
                        <IconArchive size={16} aria-hidden="true" />{" "}
                        {t("Archive wallet")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <form onSubmit={handleAdd} style={{ marginTop: "16px" }}>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={t("Wallet name (e.g. SeaBank, GCash, Cash)")}
          aria-label={t("Wallet name (e.g. SeaBank, GCash, Cash)")}
          maxLength={40}
          required
        />
        <button type="submit" disabled={busy || !newLabel.trim()}>
          <IconPlus size={16} aria-hidden="true" /> {t("Add wallet")}
        </button>
      </form>
    </section>
  );
}
