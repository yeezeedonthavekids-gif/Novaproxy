# Running the Wisp server on your own laptop or PC (free)

An old laptop makes a good free NOVA server. It uses about 70 MB of RAM and almost no CPU. The only requirement is that **it's on and online whenever you want NOVA to work**. For automatic fallback, add a second server (e.g. Render) in NOVA → Settings → Proxy & connection.

Typical power use with the screen off is 8–30 W, roughly **$1–4 a month** in electricity.

## 1. Prepare the laptop

- **Never sleep:** set "When I close the lid" to *Do nothing* and turn off sleep while plugged in.
  - Windows: Control Panel → Power Options → *Choose what closing the lid does*.
  - Ubuntu: `sudo sed -i 's/#HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf && sudo systemctl restart systemd-logind`
- **Use the integrated GPU:** on gaming laptops (e.g. RTX 3050), choose *Hybrid/Optimus* or *iGPU only* in the manufacturer's app or BIOS. The server doesn't use the GPU, and this saves power.
- **Battery health:** enable the charge limit (often 60–80%) in the manufacturer's app or BIOS if it has one.
- **Ethernet** is more reliable than Wi-Fi if you can plug in.

## 2. Install and start NOVA

**With Docker** (Windows: install Docker Desktop; Linux: `curl -fsSL https://get.docker.com | sh`):

```bash
git clone https://github.com/yeezeedonthavekids-gif/Novaproxy.git nova
cd nova
docker compose up -d
```

**Without Docker** (Node.js 22):

```bash
npm ci && npm run build
STATIC_DIR=web/dist npm start              # Windows PowerShell: $env:STATIC_DIR="web/dist"; npm start
```

Check it: open http://localhost:8080. The NOVA home page should show a green "Relay connected" chip.

Docker's `restart: unless-stopped` restarts NOVA automatically after a crash or reboot (Docker Desktop: enable *Start Docker Desktop when you sign in*).

## 3. Give it a public address

### Option A: Tailscale Funnel (free, no domain needed), recommended

1. Install Tailscale: https://tailscale.com/download, then sign in.
2. In the Tailscale admin console, enable **HTTPS certificates** and **Funnel** when prompted.
3. Run once:
   ```bash
   tailscale funnel --bg 8080
   ```
4. It prints an address like `https://your-laptop.tail1234.ts.net`. That's your NOVA:
   - Full NOVA: `https://your-laptop.tail1234.ts.net`
   - Wisp address for other NOVA sites (e.g. Netlify): `wss://your-laptop.tail1234.ts.net/wisp/`

`--bg` keeps the funnel running in the background and across reboots.

### Option B: Cloudflare Tunnel (free, needs a domain on Cloudflare)

1. Add a domain to Cloudflare (domains cost about $10 a year).
2. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*). Copy the token.
3. Under *Public hostname*, add `nova.yourdomain.com` → service `http://nova:8080`.
4. In the repo folder, create `.env` with `CLOUDFLARE_TUNNEL_TOKEN=<token>`, then:
   ```bash
   docker compose -f docker-compose.tunnel.yml up -d
   ```
5. NOVA is at `https://nova.yourdomain.com`, Wisp at `wss://nova.yourdomain.com/wisp/`.

The free *quick tunnel* (`trycloudflare.com`) gets a new random address every time it starts, so it isn't suitable for a permanent server.

## 4. Connect your NOVA site

- **On a static deployment (Netlify etc.):** set the build variable `VITE_WISP_URL=wss://<your address>/wisp/` and redeploy. Or add it per browser in Settings → Proxy & connection.
- **Lock it down:** add `ALLOWED_ORIGINS=https://your-netlify-site.netlify.app,https://<your address>` to `.env` (then `docker compose up -d` again) so other websites can't use your server.

## Good to know

- Websites see your **home IP address**, and browsing uses your home bandwidth.
- When the laptop is off, NOVA shows the relay as offline. Add a backup server in Settings for automatic failover.
- Updating: `git pull && docker compose up -d --build`.
