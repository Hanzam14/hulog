import { t } from "../i18n";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { IconSparkles } from "@tabler/icons-react";
import { rpc } from "../data";
import type { Run } from "../components/shared";
import { setSoloMode } from "../solo";

export default function NoGroup({
  run,
  busy,
  user,
}: {
  run: Run;
  busy: boolean;
  user?: string;
}) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <h1 className="sr-only">{t("Create group")}</h1>
      <div className="empty" style={{ paddingTop: "16px" }}>
        <IconSparkles size={40} aria-hidden="true" />
        <p>
          {t("Start a shared pot or paste an invite link from your partner.")}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => nameRef.current?.focus()}
        >
          {t("Create group")}
        </button>
      </div>
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
            <input
              ref={nameRef}
              name="name"
              required
              placeholder={t("Our little pot")}
            />
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
      <section>
        <h2>{t("Or track your own savings")}</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setSoloMode(true, user);
            void run(async () => {});
            navigate("/");
          }}
        >
          {t("Go solo without a partner")}
        </button>
      </section>
    </>
  );
}
