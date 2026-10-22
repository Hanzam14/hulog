import { monthLabel, shareLines, type Recap, type ShareLine } from "./recap";
import { t } from "./i18n";

// Light-palette values copied from src/style.css (:root). Canvas cannot read
// CSS variables, and the card should look the same in dark mode.
const COLORS = {
  paper: "#f5efff",
  dots: "#e2d6fa",
  ink: "#2b2140",
  soft: "#6b5e85",
  card: "#ffffff",
  line: "#d9d3e3",
  brand: "#c2386a",
  pink: "#ff7aa2",
  blue: "#5dbbff",
  leaf: "#3dbe84",
};
const WIDTH = 1080;
const HEIGHT = 1350;
const DISPLAY = "Fredoka, Nunito, system-ui, sans-serif";
const BODY = "Nunito, system-ui, sans-serif";

function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth)
    out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the group-only recap card. `lines` come from shareLines(). */
export function drawRecapCard(
  ctx: CanvasRenderingContext2D,
  month: string,
  groupName: string,
  lines: ShareLine[],
) {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS.dots;
  for (let y = 24; y < HEIGHT; y += 48)
    for (let x = 24; x < WIDTH; x += 48) ctx.fillRect(x, y, 3, 3);

  const left = 90;
  const inner = WIDTH - left * 2;
  roundRect(ctx, 60, 60, WIDTH - 120, HEIGHT - 120, 48);
  ctx.fillStyle = COLORS.card;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.line;
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.brand;
  ctx.font = `600 52px ${DISPLAY}`;
  ctx.fillText("hulog.", left, 170);

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 96px ${DISPLAY}`;
  ctx.fillText(fit(ctx, monthLabel(month), inner), left, 300);
  ctx.fillStyle = COLORS.soft;
  ctx.font = `700 44px ${BODY}`;
  ctx.fillText(fit(ctx, groupName, inner), left, 372);

  if (lines.length === 0) {
    ctx.fillStyle = COLORS.soft;
    ctx.font = `700 52px ${BODY}`;
    ctx.fillText(
      fit(ctx, t("Recap quiet month"), inner),
      left,
      HEIGHT / 2 + 40,
    );
  }
  const top = 450;
  const rowHeight = 148;
  lines.forEach((line, index) => {
    const y = top + index * rowHeight;
    ctx.fillStyle = COLORS[line.tone];
    roundRect(ctx, left, y, 16, 104, 8);
    ctx.fill();
    ctx.fillStyle = COLORS.soft;
    ctx.font = `700 38px ${BODY}`;
    ctx.fillText(fit(ctx, line.label, inner - 50), left + 48, y + 38);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 64px ${DISPLAY}`;
    ctx.fillText(fit(ctx, line.value, inner - 50), left + 48, y + 100);
  });

  ctx.fillStyle = COLORS.soft;
  ctx.font = `700 30px ${BODY}`;
  ctx.textAlign = "center";
  ctx.fillText(
    fit(ctx, t("Records only. No money moves through Hulog."), inner),
    WIDTH / 2,
    HEIGHT - 110,
  );
}

/** Render the card to a PNG blob. Resolves null when the canvas cannot encode. */
export async function renderRecapBlob(recap: Recap): Promise<Blob | null> {
  try {
    // Use the app fonts when the page already loaded them; never block on it.
    await Promise.all([
      document.fonts.load(`600 64px Fredoka`),
      document.fonts.load(`700 38px Nunito`),
    ]);
  } catch {
    /* Fallback sans-serif is fine. */
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawRecapCard(ctx, recap.month, recap.groupName, shareLines(recap));
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export const recapFileName = (month: string) => `hulog-recap-${month}.png`;

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Share the card as a file when the device can, otherwise download it. */
export async function shareRecap(recap: Recap): Promise<ShareResult> {
  const blob = await renderRecapBlob(recap);
  if (!blob) throw new Error(t("Could not share the recap"));
  const file = new File([blob], recapFileName(recap.month), {
    type: "image/png",
  });
  if (
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: `Hulog · ${monthLabel(recap.month)}`,
      });
      return "shared";
    } catch (error) {
      const reason = (error as { name?: string }).name;
      if (reason === "AbortError") return "cancelled";
      // Some browsers drop the tap's permission while the image renders;
      // saving the file still works then.
      if (reason !== "NotAllowedError") throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
