import { useState } from "react";
import type { FormEvent } from "react";
import { IconArchive, IconPencil, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "./shared";
import type { Wallet } from "../data";
import { rpc } from "../data";
import { t } from "../i18n";
import CustodyCard from "./CustodyCard";

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
    <CustodyCard
      data={data}
      walletControls={(walletId) => {
        const w = wallets.find((wallet) => wallet.id === walletId);
        if (!w) return null;
        const isOwner = w.holder_id === user;
        const isEditing = editingId === w.id;

        return (
          <div className="wallet-controls">
            {isEditing ? (
              <form
                onSubmit={handleRename(w)}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
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
                  style={{ flex: "1 1 180px" }}
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
              <>
                {isOwner && (
                  <div className="actions wallet-actions">
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
                      className="quiet danger wallet-archive"
                      disabled={busy}
                      aria-label={t("Archive wallet")}
                      title={t("Archive wallet")}
                      onClick={handleArchive(w)}
                    >
                      <IconArchive size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }}
    >
      <details className="wallet-add">
        <summary>{t("Add wallet")}</summary>
        <form onSubmit={handleAdd}>
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
      </details>
    </CustodyCard>
  );
}
