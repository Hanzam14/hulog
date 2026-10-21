import { t } from "../i18n";
import type { CustodyItem, Snapshot, Wallet } from "../data";
import { money } from "../helpers";
import Avatar from "./Avatar";
import { name } from "./shared";

interface UnifiedWalletItem {
  wallet_id: string;
  holder_id: string;
  label: string;
  holder_active: boolean;
  paluwagan_centavos: number;
  ipon_centavos: number;
  total_centavos: number;
}

/** Passbook custody stamp card showing where the couple's money is held. */
export default function CustodyCard({ data }: { data: Snapshot }) {
  const configuredWallets: Wallet[] = (data.wallets ?? []).filter(
    (w) => !w.archived_at,
  );
  const custodyItems: CustodyItem[] = data.custody ?? [];

  if (configuredWallets.length === 0 && custodyItems.length === 0) {
    return null;
  }

  const unifiedWallets: UnifiedWalletItem[] = [];

  for (const w of configuredWallets) {
    const matched = custodyItems.find((c) => c.wallet_id === w.id);
    const isMemberActive =
      data.memberships.find((m) => m.user_id === w.holder_id)?.status ===
      "active";
    unifiedWallets.push({
      wallet_id: w.id,
      holder_id: w.holder_id,
      label: w.label,
      holder_active: matched ? matched.holder_active : isMemberActive,
      paluwagan_centavos: matched ? matched.paluwagan_centavos : 0,
      ipon_centavos: matched ? matched.ipon_centavos : 0,
      total_centavos: matched ? matched.total_centavos : 0,
    });
  }

  // Include any extra custody items with positive balance that were not in configuredWallets
  for (const c of custodyItems) {
    if (
      c.total_centavos > 0 &&
      !unifiedWallets.some((item) => item.wallet_id === c.wallet_id)
    ) {
      unifiedWallets.push({
        wallet_id: c.wallet_id,
        holder_id: c.holder_id,
        label: c.label,
        holder_active: c.holder_active,
        paluwagan_centavos: c.paluwagan_centavos,
        ipon_centavos: c.ipon_centavos,
        total_centavos: c.total_centavos,
      });
    }
  }

  if (unifiedWallets.length === 0) {
    return null;
  }

  const totalActive = unifiedWallets.reduce(
    (sum, item) => sum + item.total_centavos,
    0,
  );

  // Group by holder_id, placing active members first
  const holderIds = Array.from(
    new Set(unifiedWallets.map((item) => item.holder_id)),
  );
  holderIds.sort((a, b) => {
    const memA = data.memberships.find((m) => m.user_id === a);
    const memB = data.memberships.find((m) => m.user_id === b);
    const activeA = memA?.status === "active";
    const activeB = memB?.status === "active";
    if (activeA && !activeB) return -1;
    if (!activeA && activeB) return 1;
    return 0;
  });

  return (
    <section className="custody-ledger">
      <div
        className="custody-header row"
        style={{
          marginBottom: "12px",
          borderBottom: "2px dashed var(--dots)",
          paddingBottom: "10px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px" }}>
          {t("Where our money is")}
        </h2>
        <strong
          style={{
            fontFamily: "var(--display)",
            fontSize: "20px",
            color: "var(--ink)",
          }}
        >
          {money(totalActive)}
        </strong>
      </div>
      <div style={{ display: "grid", gap: "12px" }}>
        {holderIds.map((holderId) => {
          const holderWallets = unifiedWallets.filter(
            (item) => item.holder_id === holderId,
          );
          const holderTotal = holderWallets.reduce(
            (sum, item) => sum + item.total_centavos,
            0,
          );
          const holderActive = holderWallets.some((item) => item.holder_active);

          return (
            <div
              key={holderId}
              className="custody-holder"
              style={{ display: "grid", gap: "8px" }}
            >
              <div className="holder-header row">
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Avatar data={data} id={holderId} size="sm" />
                  <span style={{ fontWeight: 700 }}>
                    {name(data, holderId)}
                  </span>
                  {!holderActive && (
                    <span
                      className="chip"
                      style={{ fontSize: "13px", padding: "4px 8px" }}
                    >
                      {t("Former member")}
                    </span>
                  )}
                </div>
                <strong
                  style={{ fontFamily: "var(--display)", fontSize: "15px" }}
                >
                  {money(holderTotal)}
                </strong>
              </div>

              <ul className="custody-wallets">
                {holderWallets.map((item) => (
                  <li key={item.wallet_id} className="custody-wallet">
                    <div className="custody-wallet-row">
                      <span>{item.label}</span>
                      <strong>{money(item.total_centavos)}</strong>
                    </div>
                    {item.paluwagan_centavos > 0 && item.ipon_centavos > 0 && (
                      <ul className="custody-split">
                        <li>
                          <span>
                            {t("Paluwagan")}: {money(item.paluwagan_centavos)}
                          </span>
                        </li>
                        <li>
                          <span>
                            {t("Ipon")}: {money(item.ipon_centavos)}
                          </span>
                        </li>
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
