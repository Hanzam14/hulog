import { useState } from "react";
import type { Snapshot } from "../data";
import { name, tone } from "./shared";

/** A member's sticker: initial, emoji, or Google photo. */
export default function Avatar({
  data,
  id,
  size = "md",
}: {
  data: Snapshot;
  id: string;
  size?: "sm" | "md" | "lg";
}) {
  const who = name(data, id);
  const profile = data.profiles.find((p) => p.id === id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo =
    profile?.avatar_kind === "photo" &&
    profile.avatar_url &&
    profile.avatar_url !== failedUrl
      ? profile.avatar_url
      : null;
  return (
    <span
      className={`avatar ${tone(data, id)} ${size}`}
      role="img"
      aria-label={who}
      title={who}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photo)}
        />
      ) : profile?.avatar_kind === "emoji" && profile.avatar_emoji ? (
        profile.avatar_emoji
      ) : (
        Array.from(who)[0]?.toUpperCase()
      )}
    </span>
  );
}
