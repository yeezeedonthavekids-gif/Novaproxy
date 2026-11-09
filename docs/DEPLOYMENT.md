# Deploying NOVA

NOVA has two parts:

| Part | What it is | Where it can run |
|---|---|---|
| **Frontend** | Static files (`web/dist`) | Anywhere: static hosts, the NOVA server itself |
| **Wisp server** | A long-running Node process with WebSockets | Docker, VPS, Render, Fly.io, Railway… **not** static hosts or serverless functions |

The simplest deployment runs both from one process. Static-host deployments run the frontend there and point it at a Wisp server hosted elsewhere.

> HTTPS is required in production: browsers only allow service workers on secure origins. If the frontend is served over HTTPS, the Wisp URL must be `wss://`.

---

## Option A: everything in one container (recommended)

```bash
git clone <your fork> nova && cd nova
cp .env.example .env        # optional
docker compose up -d
```

NOVA is now on port 8080 with `restart: unless-stopped` and a health check. Put a TLS reverse proxy in front (see Option D) or use a platform that provides HTTPS.

Without Compose:

```bash
docker build -t nova .
docker run -d --name nova --restart unless-stopped -p 8080:8080 nova
```

## Option B: Render (free tier, one click)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, then select the repo. `render.yaml` creates a Docker web service with `/health` checks.
3. Open the `https://<name>.onrender.com` URL.

Free Render instances sleep when idle and take ~30 s to wake. NOVA's client retries automatically while the server starts.

## Option C: Fly.io / Railway

- **Fly.io**: `fly launch --copy-config --no-deploy`, then `fly deploy` (uses `fly.toml`).
- **Railway**: New project → Deploy from GitHub. It detects the `Dockerfile`, and `PORT` is provided automatically.

## Option D: VPS (systemd + Caddy or nginx)

```bash
sudo useradd --system --home /opt/nova nova
sudo git clone <your fork> /opt/nova && cd /opt/nova
sudo npm ci && sudo npm run build && sudo npm prune --omit=dev
sudo chown -R nova:nova /opt/nova
sudo cp deploy/nova.service /etc/systemd/system/
sudo systemctl enable --now nova
```

The unit binds to `127.0.0.1:8080`, restarts on failure and is sandboxed. Put HTTPS in front of it:

- **Caddy** (automatic certificates): copy `deploy/Caddyfile`, set your domain, `sudo systemctl reload caddy`.
- **nginx**: use `deploy/nginx.conf`. The `Upgrade`/`Connection` headers and the long timeouts are required for Wisp.

Updating: `git pull && npm ci && npm run build && sudo systemctl restart nova`. Connected users are closed with code 1012 (Service Restart) and reconnect on their own.

## Option E: frontend on a static host + Wisp server elsewhere

First deploy a Wisp server with Option A–D. A Wisp-only server just needs `STATIC_DIR` unset. Your Wisp URL is `wss://<that-host>/wisp/`.

Lock the server to your frontend (recommended):

```bash
ALLOWED_ORIGINS=https://your-frontend.example.com
```

Then pick a host:

### Vercel
Import the repo. `vercel.json` sets the build (`npm run build -w web`) and output (`web/dist`). Add the environment variable `VITE_WISP_URL=wss://…/wisp/` and redeploy.

### Netlify
Import the repo. `netlify.toml` configures everything. Add `VITE_WISP_URL` under Site settings → Environment variables.

### Cloudflare Pages
- Build command: `npm run build -w web`
- Output directory: `web/dist`
- Environment variables: `NODE_VERSION=22`, `VITE_WISP_URL=wss://…/wisp/`

`_headers` and `_redirects` are picked up automatically.

### GitHub Pages
1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: add `NOVA_WISP_URL` = `wss://…/wisp/`.
3. Push to `main` (or run the "Deploy frontend to GitHub Pages" workflow). The workflow sets `VITE_BASE` to `/<repo>/` automatically.

### Changing the Wisp server without rebuilding
Edit `nova.config.json` in the deployed output:

```json
{ "wispUrl": "wss://nova-wisp.example.com/wisp/" }
```

Users can also add their own servers (with automatic failover) in **Settings → Proxy & connection**.

---

## Checking a deployment

- `https://<host>/health` should return `{"status":"ok", …}`.
- In NOVA, the toolbar dot should turn green and show a latency. Click it for details, or open **Diagnostics → Server health**.
- Server logs: `docker logs nova` / `journalctl -u nova -f`.
