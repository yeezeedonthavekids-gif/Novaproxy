/* global UVServiceWorker */
// Ultraviolet service worker. Registered with scope <base>/uv/service/ so it
// only wakes up for proxied Ultraviolet traffic and stays idle otherwise.
importScripts("./vendor/uv.bundle.js", "./uv.config.js", "./vendor/uv.sw.js");

const uv = new UVServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (uv.route(event)) return uv.fetch(event);
      return fetch(event.request);
    })(),
  );
});
