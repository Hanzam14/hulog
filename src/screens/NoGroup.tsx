import { t } from "../i18n";
import { useNavigate } from "react-router-dom";
import { rpc } from "../data";
import type { Run } from "../components/shared";

export default function NoGroup({ run, busy }: { run: Run; busy: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <h1 className="sr-only">{t("Create group")}</h1>
      <section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              rpc("create_group", {
                p_name: f.get("name"),
                p_pot_location: f.get("pot"),
              }),
            );
          }}
        >
          <label>
            {t("Group name")}
            <input name="name" required placeholder={t("Our little pot")} />
          </label>
          <label>
            {t("Pot held at")}
            <input name="pot" placeholder={t("MariBank, cash…")} />
          </label>
          <button disabled={busy}>{t("Create group")}</button>
        </form>
      </section>
      <section>
        <h2>{t("I have an invite link")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const value = String(f.get("link")).trim();
            const token = value.split("/join/").pop()?.split(/[?#]/)[0];
            if (token) navigate(`/join/${encodeURIComponent(token)}`);
          }}
        >
          <label>
            {t("Paste the invite link")}
            <input name="link" required />
          </label>
          <button disabled={busy} className="secondary">
            {t("Open invite")}
          </button>
        </form>
      </section>
    </>
  );
}
