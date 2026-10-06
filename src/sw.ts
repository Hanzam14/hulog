/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

clientsClaim();
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// Older installs ran an auto-updating worker whose page can never send
// SKIP_WAITING. Take over from those once; prompt-capable workers leave a marker.
const META_CACHE = "hulog-sw-meta";
const PROMPT_MARKER = "/__hulog-prompt-sw";
let replacingLegacy = false;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!self.registration.active) return;
      const meta = await caches.open(META_CACHE);
      if (await meta.match(PROMPT_MARKER)) return;
      replacingLegacy = true;
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  const marked = caches
    .open(META_CACHE)
    .then((meta) => meta.put(PROMPT_MARKER, new Response("1")));
  event.waitUntil(marked);
  if (!replacingLegacy) return;
  // Legacy pages have no update UI; reload them once onto this version.
  // Not awaited in waitUntil: their navigations need this worker activated first.
  void marked
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((pages) => pages.forEach((page) => void page.navigate(page.url)));
});
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

self.addEventListener("push", (event) => {
  const payload: { title?: string; body?: string; url?: string } = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return {};
    }
  })();
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Hulog", {
      body: payload.body ?? "You have a Hulog update.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin)
    .href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          const windowClient = client as WindowClient;
          await windowClient.navigate(url);
          await windowClient.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
