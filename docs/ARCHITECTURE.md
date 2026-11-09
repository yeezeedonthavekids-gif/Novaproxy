# Architecture and decisions

## Overview

```
Browser tab (NOVA shell, Preact)
 ├─ tab iframe  ── /uv/service/<encoded>   ─┐   Ultraviolet SW (scope /uv/service/)
 ├─ tab iframe  ── /scram/service/<encoded> ─┤   Scramjet SW    (scope /scram/service/)
 │                                           ▼
 │                         bare-mux SharedWorker ── Epoxy / libcurl transport (TLS in WASM)
 │                                           │  one WebSocket
 ▼                                           ▼
static files  ◄────────────  NOVA server  (/wisp/, /health, static)  ──TCP──►  websites
```

## Key decisions

**Preact + signals instead of React.** About 8 KB instead of about 45 KB, and signals update only the components that read a value, so few re-renders. No UI library and no icon font: the icon set is inline SVG paths.

**A separate service worker per engine.** Each engine registers with a narrow scope (`/uv/service/`, `/scram/service/`). The larger Scramjet runtime (180 KB JS + 540 KB WASM) is never downloaded unless the user picks Scramjet, and neither worker wakes up for NOVA's own requests.

**Lazy everything.** Proxy runtime and transport: first navigation (or address-bar focus, outside Efficiency mode). Pages: first open. Game catalog: opening Games. Weather: only if enabled. The Wisp status check starts on `requestIdleCallback`.

**No polling.** The clock aligns to minute boundaries. The Wisp monitor checks at startup, on `online`/visibility changes, after page loads (throttled to once a minute) and with backoff while offline. Diagnostics samples only while its page is open and visible.

**Tab sleeping.** Background web tabs (and a games tab) are discarded after a profile-dependent timeout, which frees the iframe. Views are rendered in creation order because moving an iframe in the DOM would reload it.

**Unified engine interface.** `ProxyEngine { prepare, encode, decode }`. Adding an engine means one object in `web/src/proxy/index.ts` plus its service worker.

**Wisp server: wrap, don't rewrite.** The protocol is handled by the reference implementation (pinned). NOVA adds the operational layer: limits, heartbeats with dead-peer detection, SSRF defaults, drain, health and IP handling.

**Transports pinned to bare-mux 2-compatible versions.** Epoxy 3.x and libcurl-transport 2.x target a newer transport API (headers as arrays) that UV 3 and Scramjet 1 don't use. NOVA pins `epoxy-transport@2.1.29` and `libcurl-transport@1.5.2`. This was found by end-to-end testing.

**Games are not redistributed.** The source repository has no license, so NOVA reads the project's public catalog and loads games on demand from it, credits creators, strips trackers and sandboxes the player.

**Favicons load through the proxy from inside the frame.** Engines hook element getters (so `link.href` returns the real URL), and only documents controlled by the engine's service worker get proxied subresources. NOVA creates the image in the proxied document with the native `src` setter, then stores a 32×32 data URL so it never needs the network again.

**Honest status.** Every indicator is backed by a real measurement: Wisp handshakes, `performance.memory`, Long Task API, navigation timing. Browser estimates (device memory, connection type) are labelled as such.

## Data storage

All user data is in the browser. localStorage keys use the `nova:` prefix, wallpapers go to IndexedDB `nova-media`. Proxied sites' data sits alongside but is identifiable, which lets "Clear site data" remove exactly the non-NOVA data. Nothing is sent to the NOVA server except proxied traffic.
