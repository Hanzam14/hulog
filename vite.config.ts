import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import packageInfo from "./package.json" with { type: "json" };

let appVersion = packageInfo.version;
try {
  appVersion += `+${execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()}`;
} catch {
  /* Source archives may not have Git. */
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      manifest: {
        name: "Hulog",
        short_name: "Hulog",
        description: "Your two-person paluwagan, one day at a time.",
        theme_color: "#fff6d8",
        background_color: "#fff6d8",
        display: "standalone",
        start_url: "/",
        id: "/",
        scope: "/",
        lang: "fil-PH",
        orientation: "portrait",
        categories: ["finance", "lifestyle"],
        shortcuts: [
          {
            name: "Mag-record ng hulog",
            url: "/hulog",
            icons: [
              { src: "/shortcut-96.png", sizes: "96x96", type: "image/png" },
            ],
          },
          {
            name: "History",
            url: "/history",
            icons: [
              { src: "/shortcut-96.png", sizes: "96x96", type: "image/png" },
            ],
          },
        ],
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});
