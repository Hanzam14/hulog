import { useNavigate } from "react-router-dom";
import { rpc } from "../data";
import type { Run } from "../components/shared";

export default function NoGroup({ run, busy }: { run: Run; busy: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <h1>Start your daily promise.</h1>
      <section>
        <h2>Create group</h2>
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
            Group name
            <input name="name" required placeholder="Our little pot" />
          </label>
          <label>
            Pot held at
            <input name="pot" placeholder="MariBank, cash…" />
          </label>
          <button disabled={busy}>Create group</button>
        </form>
      </section>
      <section>
        <h2>I have an invite link</h2>
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
            Paste the invite link
            <input name="link" required />
          </label>
          <button disabled={busy} className="secondary">
            Open invite
          </button>
        </form>
      </section>
    </>
  );
}
