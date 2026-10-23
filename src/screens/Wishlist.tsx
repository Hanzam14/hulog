import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronLeft,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { Snapshot, WishlistItem } from "../data";
import { rpc } from "../data";
import { money, parsePesos, shortDate } from "../helpers";
import { t } from "../i18n";
import { name } from "../components/shared";
import type { Run, ViewProps } from "../components/shared";
import {
  WISHLIST_MAX_ITEMS,
  WISHLIST_NOTE_MAX,
  WISHLIST_TITLE_MAX,
  linkableGoals,
  liveWishlist,
  manilaDay,
  sortWishlist,
  wishlistProgress,
} from "../wishlist";

const firstName = (data: Snapshot, id: string) =>
  name(data, id).trim().split(/\s+/)[0];

export function WishlistForm({
  data,
  item,
  busy,
  run,
  close,
}: {
  data: Snapshot;
  item?: WishlistItem;
  busy: boolean;
  run: Run;
  close: () => void;
}) {
  const goals = linkableGoals(data.savingsGoals);
  const linkedDefault = goals.find((g) => g.id === item?.linked_goal_id)?.id;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await rpc(item ? "edit_wishlist_item" : "add_wishlist_item", {
        ...(item ? { p_id: item.id } : {}),
        p_title: form.get("title"),
        p_price_centavos: parsePesos(String(form.get("price"))),
        p_note: form.get("note"),
        p_linked_goal_id: form.get("goal") || null,
      });
      close();
    });
  };
  return (
    <form onSubmit={submit} className="personal-form wish-form">
      <label>
        {t("What do you want?")}
        <input
          name="title"
          required
          maxLength={WISHLIST_TITLE_MAX}
          defaultValue={item?.title}
        />
      </label>
      <label>
        {t("Price (₱)")}
        <input
          name="price"
          inputMode="decimal"
          required
          defaultValue={item ? (item.price_centavos / 100).toFixed(2) : ""}
        />
      </label>
      <label>
        {t("Note (optional)")}
        <input
          name="note"
          maxLength={WISHLIST_NOTE_MAX}
          defaultValue={item?.note ?? ""}
        />
      </label>
      {goals.length > 0 && (
        <label>
          {t("Link to a shared ipon goal (optional)")}
          <select name="goal" defaultValue={linkedDefault ?? ""}>
            <option value="">{t("No linked goal")}</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="meta">
        {t(
          "Only shared ipon goals can be linked. Personal savings stay private.",
        )}
      </p>
      <div className="actions">
        <button disabled={busy}>{item ? t("Save item") : t("Add item")}</button>
        <button className="quiet" type="button" onClick={close}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

export function WishlistRow({
  data,
  item,
  busy,
  run,
  edit,
}: {
  data: Snapshot;
  item: WishlistItem;
  busy: boolean;
  run: Run;
  edit: () => void;
}) {
  const bought = item.status === "bought";
  const progress = wishlistProgress(item, data.savingsGoals);
  return (
    <article
      className={bought ? "sticker wish-item bought" : "sticker wish-item"}
    >
      <div className="row">
        <h3>{item.title}</h3>
        <strong className="wish-price">{money(item.price_centavos)}</strong>
      </div>
      {item.note && <p className="meta wish-note">{item.note}</p>}
      {progress && (
        <div className="wish-progress">
          <Link to={"/ipon/" + progress.goal.id} className="meta">
            {t("Goal: {title}", { title: progress.goal.title })}
          </Link>
          <p className={progress.ready ? "wish-ready" : "meta"}>
            {t(
              progress.ready
                ? "{saved} of {price} — kaya na!"
                : "{saved} of {price}",
              {
                saved: money(progress.saved),
                price: money(progress.price),
              },
            )}
          </p>
          <div
            className="pot-progress"
            role="progressbar"
            aria-label={t("Saved toward this item")}
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: progress.percent + "%" }} />
          </div>
        </div>
      )}
      <p className="meta">
        {bought && item.bought_by && item.bought_at
          ? t("Bought by {name} · {date}", {
              name: firstName(data, item.bought_by),
              date: shortDate(manilaDay(item.bought_at)),
            })
          : t("Added by {name}", { name: firstName(data, item.added_by) })}
      </p>
      <div className="actions wish-actions">
        <button
          className={bought ? "secondary" : undefined}
          disabled={busy}
          onClick={() =>
            void run(() =>
              rpc("set_wishlist_bought", {
                p_id: item.id,
                p_bought: !bought,
              }),
            )
          }
        >
          {bought ? (
            <>
              <IconArrowBackUp size={18} aria-hidden="true" />{" "}
              {t("Undo bought")}
            </>
          ) : (
            <>
              <IconCheck size={18} aria-hidden="true" /> {t("Mark as bought")}
            </>
          )}
        </button>
        {!bought && (
          <button
            className="quiet"
            aria-label={t("Edit {title}", { title: item.title })}
            disabled={busy}
            onClick={edit}
          >
            <IconPencil size={18} aria-hidden="true" />
          </button>
        )}
        <button
          className="quiet"
          aria-label={t("Delete {title}", { title: item.title })}
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                t("Delete this wishlist item? The change stays in history."),
              )
            )
              void run(() => rpc("delete_wishlist_item", { p_id: item.id }));
          }}
        >
          <IconTrash size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default function Wishlist({ data, run, busy }: ViewProps) {
  const items = sortWishlist(liveWishlist(data.wishlistItems));
  const wanted = items.filter((i) => i.status === "wanted");
  const bought = items.filter((i) => i.status === "bought");
  const [editing, setEditing] = useState<WishlistItem | "new" | null>(null);
  const full = items.length >= WISHLIST_MAX_ITEMS;
  const rows = (list: WishlistItem[]) =>
    list.map((item) =>
      editing !== "new" && editing?.id === item.id ? (
        <WishlistForm
          key={item.id}
          data={data}
          item={item}
          busy={busy}
          run={run}
          close={() => setEditing(null)}
        />
      ) : (
        <WishlistRow
          key={item.id}
          data={data}
          item={item}
          busy={busy}
          run={run}
          edit={() => setEditing(item)}
        />
      ),
    );
  return (
    <>
      <div className="row">
        <Link to="/" className="back" aria-label={t("Back")}>
          <IconChevronLeft aria-hidden="true" />
        </Link>
        <h1>{t("Gusto natin")}</h1>
      </div>
      <p className="meta">
        {t(
          "Hulog only records this. Buying is your own action outside the app.",
        )}
      </p>
      {editing === "new" ? (
        <WishlistForm
          data={data}
          busy={busy}
          run={run}
          close={() => setEditing(null)}
        />
      ) : full ? (
        <p className="meta">{t("Maximum of 30 wishlist items reached")}</p>
      ) : (
        <button disabled={busy} onClick={() => setEditing("new")}>
          <IconPlus size={18} aria-hidden="true" /> {t("Add to wishlist")}
        </button>
      )}
      {items.length === 0 && editing !== "new" && (
        <div className="empty">
          <p>{t("Nothing on the wishlist yet")}</p>
        </div>
      )}
      {wanted.length > 0 && (
        <section className="wish-section">
          <h2 className="section-label">{t("Still wanted")}</h2>
          {rows(wanted)}
        </section>
      )}
      {bought.length > 0 && (
        <section className="wish-section">
          <h2 className="section-label">{t("Nabili na")}</h2>
          {rows(bought)}
        </section>
      )}
    </>
  );
}
