/* global $scramjetLoadWorker */
// Scramjet service worker. Registered with scope <base>/scram/service/ so the
// (larger) Scramjet runtime is only loaded when the Scramjet engine is used.
importScripts("./vendor/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
      return fetch(event.request);
    })(),
  );
});
