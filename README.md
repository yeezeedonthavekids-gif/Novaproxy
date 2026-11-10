# NOVA

A lightweight, private, customizable browser environment for the web: tabs, an address bar, bookmarks, a game launcher and a privacy dashboard, with web traffic relayed through your own **Wisp** server by the **Ultraviolet** or **Scramjet** proxy engines.

NOVA is built for low-end hardware first. Budget Chromebooks and older 4 GB laptops are the target, not an afterthought.

| | |
|---|---|
| Initial JavaScript | **≈ 39 KB** gzipped (Preact + signals, no UI library) |
| Home page JS heap | **≈ 2 MB** (measured in Chromium) |
| First contentful paint | **≈ 80 ms** (local server) |
| Idle CPU | **< 1 ms per 10 s** — no polling, no background timers |
| Server memory (idle) | **≈ 70 MB** RSS |

Proxy engines, transports, games, settings and every other page are loaded only when you first use them.

---

## Features

**Browser shell**: tabs (drag to reorder, pin, duplicate, sleep, reopen closed), an address bar with local suggestions (bookmarks, history, NOVA pages), back/forward/reload/home, a bookmark bar, per-tab engine switching, a live Wisp connection indicator, minimal presentation mode and fullscreen.

**Proxy**
- Ultraviolet 3 and Scramjet 1 behind one interface (`web/src/proxy/index.ts`). Each engine runs in its **own service-worker scope**, so an engine you don't use costs nothing.
- Encrypted transports: **Epoxy** or **libcurl.js**. TLS to websites runs *inside your browser*, so the Wisp server only relays encrypted bytes for HTTPS sites.
- Clear errors when something fails: NOVA's own error page when the Wisp server is unreachable, a "try the other engine" hint for slow pages, and links that open in new windows stay inside NOVA.

**Self-hosted Wisp server** (`server/`), hardened for long uptimes: real dead-peer detection, connection limits, rate limiting, SSRF protection, graceful drain, `/health`, and automatic restarts under Docker or systemd. See [docs/WISP-SERVER.md](docs/WISP-SERVER.md).

**Connection reliability (client side)**: the status comes from a real Wisp handshake, never a fake indicator. NOVA retries with exponential backoff (2 s → 60 s), re-checks when the network returns or the tab is shown again, and **fails over** between multiple Wisp servers. The transport is rebuilt automatically after an outage.

**Customization**: 6 UI presets, dark/light/system, accent colours, 5 font styles (no web fonts downloaded), corner radius, density, gradient or custom image wallpapers (dim and blur), optional glass, safe custom CSS, home layouts (centered, dashboard, minimal), drag-and-drop widgets with S/M/L sizes, a configurable toolbar, editable keyboard shortcuts with conflict detection, and settings import/export.

**Performance profiles**: Efficiency, Balanced and Visual. They control animations, blur and glass, tab-sleep timing, background game handling and proxy warm-up. The profile is auto-selected from what the browser reports (≤ 4 GB RAM, ≤ 2 cores or Data Saver → Efficiency). Reduced-motion preferences are respected.

**Bookmarks**: folders, drag-and-drop, bookmark bar, custom icons (emoji, image or uploaded), search, and import/export in Netscape HTML (compatible with every browser) or JSON.

**Games**: a launcher for the [gn-math](https://github.com/gn-math) library with search, categories, favourites, recently played, cover art, fullscreen, a sandboxed player and creator credits. See [Games](#games-and-licensing) below.

**Ghost**: one configurable shortcut (default `Alt+G`) opens a quick-navigation palette (Google Classroom, your homepage, a fresh tab, plus your own destinations), or jumps straight to your default. It never fires while you're typing.

**Tab presentation**: name your workspace, choose the browser-tab title (current page, workspace or custom) and icon (NOVA, accent, dot or your upload), plus minimal mode and a clean new-tab page. NOVA ships no presets that imitate other sites.

**Privacy dashboard**: relay status, engine and transport state, a plain-language list of what is and **isn't** protected, a private-session mode, history retention, cookie and site-data clearing, open-session management, and "erase everything".

**Diagnostics**: Wisp latency test, server health, engine, transport and service-worker status, JS heap (Chromium), main-thread delay, long tasks, page-load timings, network estimates (labelled as estimates) and the list of loaded modules. Unavailable values are shown as unavailable, never guessed.

**Also included**: history (local only, configurable retention), Scramjet download tracking, notes, quick links, an optional weather widget (fetched *through* the relay), selectable and custom search engines, and `?url=` / `?q=` deep links.

---

## Quick start

Requires Node.js 20.11+ (22 recommended).

```bash
npm install
npm run build
STATIC_DIR=web/dist npm start      # → http://localhost:8080
```

That one process serves the frontend **and** the Wisp server at `/wisp/`.

Development (hot reload on :5173, Wisp server on :8080):

```bash
npm run dev
```

> Service workers require HTTPS (or `localhost`). Deploy behind HTTPS in production.

## Deploying

The easiest option is the all-in-one Docker image (frontend + Wisp server on one port):

```bash
docker compose up -d
```

Or one-click on **Render** with the included `render.yaml` (New → Blueprint → this repo).

| Platform | What runs there | How |
|---|---|---|
| Your own laptop/PC (free) | Frontend + Wisp | [docs/LAPTOP.md](docs/LAPTOP.md): Docker + Tailscale Funnel or Cloudflare Tunnel |
| Docker / VPS | Frontend + Wisp | `docker compose up -d`, or `deploy/nova.service` (systemd) behind `deploy/Caddyfile` / `deploy/nginx.conf` |
| Render, Fly.io, Railway | Frontend + Wisp | `render.yaml`, `fly.toml`, or the `Dockerfile` |
| Vercel, Netlify, Cloudflare Pages | Frontend only | `vercel.json`, `netlify.toml`, `_headers`/`_redirects` |
| GitHub Pages | Frontend only | `.github/workflows/pages.yml` |

Static hosts **can't run a persistent WebSocket server**, so host the Wisp server somewhere that can (Docker, VPS, Render…) and point the frontend at it:

- at build time: `VITE_WISP_URL=wss://your-server.example.com/wisp/`
- or after building, without rebuilding: edit `nova.config.json` in the deployed files
- or per user: Settings → Proxy & connection → Wisp servers

Full step-by-step guides for each platform: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Configuration

Every server option is an environment variable with a safe default. See [`.env.example`](.env.example) for the full list. The most useful ones:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Listen address |
| `STATIC_DIR` | *(empty)* | Serve the built frontend (empty = Wisp-only mode) |
| `ALLOWED_ORIGINS` | *(anyone)* | Restrict which sites may use your Wisp server |
| `MAX_CONNECTIONS_PER_IP` | `20` | Per-user concurrent connection cap |
| `CONNECT_RATE_PER_MINUTE` | `60` | New connections per IP per minute |
| `BLOCKED_HOSTS` | | Regex list of blocked destinations |
| `LOG_LEVEL` | `info` | `debug` also logs destinations; any other level never does |

## Testing

```bash
npm test -w server   # 21 tests: real Wisp v1/v2 connections proxying real TCP, limits, SSRF, heartbeats, shutdown
npm test -w web      # 13 end-to-end scenarios in Chromium against the production build (needs Playwright)
```

The end-to-end suite starts the real server and a local test website, then drives NOVA through both engines: page loads, JavaScript, `fetch()`, links, back, forms, favicons, new-tab links, shortcuts inside proxied pages, Ghost, bookmark import/export, persistence, the games player (both isolation modes), Wisp outage and recovery, and private sessions.

## Games and licensing

Games come from the community project **gn-math**. Its `html` repository holds about 900 game files with **no license file**, so NOVA **does not copy or redistribute them**. NOVA reads the project's own catalog (`gn-math/assets/zones.json`: names, authors, covers) and loads each game on demand from the project's repository via jsDelivr. Every game page credits its creator.

Before running a game, NOVA strips third-party analytics and ad scripts from its HTML. Games run in a sandboxed iframe:

- **Isolated** (default): the game gets no access to NOVA's data. Some games can't save or won't start.
- **Compatible**: the game can use storage, but it shares NOVA's origin. Use it only for games you trust.

To use a mirror, set `gamesCatalogUrl`, `gamesHtmlBaseUrl` and `gamesCoverBaseUrl` in `nova.config.json`.

## Known limitations

- **Not anonymity.** The Wisp server operator can see which hostnames you connect to. Sites can still identify you if you sign in, or by fingerprinting. Plain-HTTP sites are readable by the relay.
- **Site compatibility varies.** Neither engine supports every site. Heavy web apps, some logins, CAPTCHAs and DRM video may fail. Datacenter IPs get more CAPTCHAs; switching engines helps for many sites.
- **Proxied sites share NOVA's origin.** Their cookies and storage live next to NOVA's data in your browser. The engines isolate them, but this is not a hard security boundary. Clear site data from the Privacy dashboard.
- **Per-site cookie viewing isn't available.** Each engine stores cookies in its own internal format, so NOVA clears them together.
- **Downloads** are tracked in NOVA only with Scramjet. With Ultraviolet, the browser's own download manager handles them.
- **Shortcuts can't reach isolated games.** Keyboard shortcuts don't work while an isolated game has focus (cross-origin sandbox); press Esc or click outside first. Browser-reserved shortcuts (Ctrl+T, Ctrl+W…) can't be used.
- **Memory readings are limited.** They're only available in Chromium-based browsers, and they cover NOVA's own page, not proxied sites running in other processes.
- **Firefox private windows** don't allow service workers, so proxying is unavailable there. NOVA explains this when it happens.
- The game CDN (jsDelivr) is contacted directly and can see your IP.
- This project was built and tested in an environment with no outbound internet. Proxying was verified end to end against a local website through the real server, but not against live public websites.

## Project structure

```
server/                Wisp server (TypeScript, Node http + ws + wisp-js)
  src/wisp.ts          gateway: limits, heartbeats, SSRF, drain
  src/static.ts        static hosting with pre-compressed assets
web/                   frontend (Vite + Preact + TypeScript)
  src/proxy/           unified engine interface, transport, Wisp monitor
  src/components/      browser shell (tabs, toolbar, web view, Ghost…)
  src/pages/           lazily loaded pages (games, settings, privacy…)
  public/uv, scram/    service workers + engine configs
  test/                end-to-end tests
deploy/                systemd, Caddy, nginx
docs/                  deployment, architecture, Wisp server
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

NOVA's own code is MIT licensed. Bundled third-party components keep their licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
