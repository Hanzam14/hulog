import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { rpc } from "../data";
import type { Profile } from "../data";
import Avatar from "./Avatar";
import { emojis, palette, tone } from "./shared";
import type { ViewProps } from "./shared";

export default function ProfileEditor({
  data,
  user,
  run,
  busy,
  close,
}: ViewProps & { close: () => void }) {
  const own = data.profiles.find((p) => p.id === user)!;
  const [nickname, setNickname] = useState(own.nickname ?? "");
  const [kind, setKind] = useState(own.avatar_kind);
  const [emoji, setEmoji] = useState(own.avatar_emoji ?? emojis[0]);
  const [color, setColor] = useState(own.color);
  const preview = {
    ...data,
    profiles: data.profiles.map((p) =>
      p.id === user
        ? {
            ...p,
            nickname: nickname.trim() || null,
            avatar_kind: kind,
            avatar_emoji: emoji,
            color,
          }
        : p,
    ),
  };
  const partner = data.memberships.find(
    (m) => m.status === "active" && m.user_id !== user,
  );
  const taken = partner ? tone(data, partner.user_id) : null;
  return (
    <section className="profile-editor" aria-labelledby="profile-title">
      <div className="row">
        <h2 id="profile-title">Ikaw</h2>
        <button
          type="button"
          className="round secondary"
          aria-label="Isara ang profile"
          onClick={close}
          disabled={busy}
        >
          <IconX />
        </button>
      </div>
      <div className="profile-preview">
        <Avatar data={preview} id={user} size="lg" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await rpc("update_profile", {
              p_nickname: nickname,
              p_avatar_kind: kind,
              p_avatar_emoji: kind === "emoji" ? emoji : null,
              p_color: color,
            });
            close();
          });
        }}
      >
        <label>
          Nickname
          <input
            value={nickname}
            placeholder={own.display_name}
            maxLength={24}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Avatar</legend>
          <div className="segmented" role="group" aria-label="Avatar kind">
            {(
              [
                "initial",
                "emoji",
                ...(own.avatar_url ? ["photo"] : []),
              ] as Profile["avatar_kind"][]
            ).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === "initial"
                  ? "Initial"
                  : value === "emoji"
                    ? "Emoji"
                    : "Photo"}
              </button>
            ))}
          </div>
        </fieldset>
        {kind === "emoji" && (
          <div className="emoji-grid" role="group" aria-label="Pumili ng emoji">
            {emojis.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={value}
                aria-pressed={emoji === value}
                onClick={() => setEmoji(value)}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        <fieldset>
          <legend>Kulay</legend>
          <div className="color-grid" role="group" aria-label="Profile color">
            {(["auto", ...palette] as const).map((value) => (
              <button
                type="button"
                className={`color-choice ${value}`}
                key={value}
                aria-pressed={color === value}
                aria-label={`${value}${taken === value ? " — kulay ng partner" : ""}`}
                onClick={() => setColor(value)}
              >
                <span className="swatch" aria-hidden="true">
                  {taken === value ? "•" : ""}
                </span>
                {value === "auto"
                  ? "Auto"
                  : value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          {taken && (
            <p className="muted">• Kulay ng partner — puwede pa ring piliin.</p>
          )}
          {color !== "auto" && tone(preview, user) !== color && (
            <p className="muted">
              Pareho kayo ng kulay. {tone(preview, user)} ang sticker mo para
              madaling makilala.
            </p>
          )}
        </fieldset>
        <button disabled={busy}>Save</button>
      </form>
    </section>
  );
}
