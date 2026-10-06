import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      manifest: {
        name: "Hulog — our paluwagan",
        short_name: "Hulog",
        description: "Your two-person paluwagan, one day at a time.",
        theme_color: "#176b52",
        background_color: "#f7f7f0",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});
