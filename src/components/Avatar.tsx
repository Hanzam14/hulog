import type { Snapshot } from "../data";
import { name, tone } from "./shared";

/** A member's round sticker: their initial in their own color. */
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
  return (
    <span className={`avatar ${tone(data, id)} ${size}`} title={who}>
      {who.charAt(0).toUpperCase()}
    </span>
  );
}
