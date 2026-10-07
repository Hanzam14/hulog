import type { Snapshot } from "../data";
import { tone } from "./shared";
import { t } from "../i18n";

const key = "hulog-confetti-seen";
const sessionSeen = new Set<string>();
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function parseSeenIds(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((id): id is string => typeof id === "string"),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

/** Only payouts received in the last week celebrate, so old rounds never burst after an update. */
export const recentlyReceived = (receivedAt: string | null, now = Date.now()) =>
  !!receivedAt && now - Date.parse(receivedAt) <= 7 * 24 * 60 * 60 * 1000;

export function claimCelebration(
  id: string,
  storage: StorageLike,
  memory = sessionSeen,
) {
  if (memory.has(id)) return false;
  let seen: string[] = [];
  try {
    seen = parseSeenIds(storage.getItem(key));
  } catch {
    /* Device storage is optional. */
  }
  memory.add(id);
  if (seen.includes(id)) return false;
  try {
    storage.setItem(key, JSON.stringify([...seen, id]));
  } catch {
    /* Keep session memory. */
  }
  return true;
}

let removeBurst: (() => void) | undefined;
export function celebratePayout(id: string, data: Snapshot) {
  // Accessing window.localStorage itself can throw in private/blocked contexts.
  const storage: StorageLike = {
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => window.localStorage.setItem(name, value),
  };
  if (!claimCelebration(id, storage)) return;
  removeBurst?.();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const sticker = document.createElement("div");
    sticker.className = "celebration-toast";
    sticker.setAttribute("role", "status");
    sticker.textContent = t("Natanggap na! 🎉");
    document.body.append(sticker);
    const timer = window.setTimeout(() => sticker.remove(), 2200);
    removeBurst = () => {
      clearTimeout(timer);
      sticker.remove();
    };
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const css = getComputedStyle(document.documentElement);
  const colors = [
    ...data.memberships
      .filter((m) => m.status === "active")
      .map((m) => css.getPropertyValue(`--${tone(data, m.user_id)}`).trim()),
    "#ffd34d",
    css.getPropertyValue("--ink").trim(),
  ];
  let width = innerWidth,
    height = innerHeight;
  const resize = () => {
    width = innerWidth;
    height = innerHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
  const pieces = Array.from({ length: 120 }, (_, i) => ({
    x: width / 2,
    y: height * 0.55,
    vx: (Math.random() - 0.5) * 520,
    vy: -220 - Math.random() * 420,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 12,
    size: 4 + Math.random() * 5,
    color: colors[i % colors.length],
    kind: i < 6 ? "coin" : i % 3 === 0 ? "circle" : "rect",
  }));
  const start = performance.now();
  let last = start,
    frame = 0;
  const cleanup = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };
  removeBurst = cleanup;
  const draw = (now: number) => {
    const elapsed = now - start;
    if (elapsed >= 2200) {
      cleanup();
      return;
    }
    frame = requestAnimationFrame(draw);
    if (now - last < 1000 / 60) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.min(1, (2200 - elapsed) / 450);
    for (const p of pieces) {
      p.vy += 480 * dt;
      p.x += (p.vx + Math.sin(elapsed / 250 + p.spin) * 24) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.kind === "coin" ? "#ffd34d" : p.color;
      if (p.kind === "rect")
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        if (p.kind === "coin") {
          ctx.fillStyle = "#2a2320";
          ctx.font = `${p.size * 0.8}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("₱", 0, 0);
        }
      }
      ctx.restore();
    }
  };
  frame = requestAnimationFrame(draw);
}
