import { t, label } from "../i18n";
import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { rpc } from "../data";
import type { Profile } from "../data";
import Avatar from "./Avatar";
import { emojis, name, palette, tone } from "./shared";
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
        <h2 id="profile-title">{t("Ikaw")}</h2>
        <button
          type="button"
          className="round secondary"
          aria-label={t("Isara ang profile")}
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
          {t("Nickname")}
          <input
            value={nickname}
            placeholder={own.display_name}
            maxLength={24}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>{t("Avatar")}</legend>
          <div className="segmented" role="group" aria-label={t("Avatar kind")}>
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
                  ? t("Initial")
                  : value === "emoji"
                    ? t("Emoji")
                    : t("Photo")}
              </button>
            ))}
          </div>
        </fieldset>
        {kind === "emoji" && (
          <div
            className="emoji-grid"
            role="group"
            aria-label={t("Pumili ng emoji")}
          >
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
          <legend>{t("Kulay")}</legend>
          <div
            className="color-grid"
            role="group"
            aria-label={t("Profile color")}
          >
            {(["auto", ...palette] as const).map((value) => (
              <button
                type="button"
                className={`color-choice ${value}`}
                key={value}
                aria-pressed={color === value}
                aria-label={
                  taken === value
                    ? t("{color} — kulay ng partner", { color: label(value) })
                    : label(value)
                }
                onClick={() => setColor(value)}
              >
                <span
                  className={`swatch ${taken === value ? "taken" : ""}`}
                  aria-hidden="true"
                >
                  {taken === value && partner
                    ? name(data, partner.user_id).charAt(0).toUpperCase()
                    : ""}
                </span>
                {value === "auto"
                  ? t("Auto")
                  : label(value).charAt(0).toUpperCase() +
                    label(value).slice(1)}
              </button>
            ))}
          </div>
          {color !== "auto" && tone(preview, user) !== color && (
            <p className="muted">
              {t(
                "Pareho kayo ng kulay. {color} ang sticker mo para madaling makilala.",
                { color: label(tone(preview, user)) },
              )}
            </p>
          )}
        </fieldset>
        <button disabled={busy}>{t("Save")}</button>
      </form>
    </section>
  );
}
