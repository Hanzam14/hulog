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
