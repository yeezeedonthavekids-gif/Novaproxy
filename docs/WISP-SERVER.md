# The NOVA Wisp server

[Wisp](https://github.com/MercuryWorkshop/wisp-protocol) multiplexes many TCP/UDP streams over a single WebSocket. NOVA's server (`server/`) implements it with **@mercuryworkshop/wisp-js**, the protocol's reference implementation, pinned to an exact version and wrapped in a hardened gateway.

## Why it stays up

| Problem | What NOVA does |
|---|---|
| Phones and Wi-Fi drop without closing sockets, so dead connections pile up | Heartbeat pings every `HEARTBEAT_SECONDS` (25). A peer that misses a pong is terminated and its streams freed |
| Idle TCP sockets silently time out on NATs | TCP keep-alive and `setNoDelay` on every upgraded socket |
| One abusive client exhausts the server | `MAX_CONNECTIONS`, `MAX_CONNECTIONS_PER_IP`, `CONNECT_RATE_PER_MINUTE`, optional stream limits, `MAX_PAYLOAD_BYTES` |
| Everyone behind a load balancer looks like one IP | Trusted-proxy CIDRs (private ranges by default) and `X-Forwarded-For` |
| Malformed packets | Errors stay inside the connection; the test suite sends garbage frames and the server keeps serving |
| An unexpected exception | Logged and contained. If errors storm (>25/min) the process exits so Docker/systemd restarts it cleanly |
| Deploys and restarts cut users off | SIGTERM drains: clients get close code 1012 (Service Restart), and NOVA's client reconnects with backoff |
| Slowloris-style clients | Header and request timeouts on the HTTP server |
| Silent failures | `/health` reports active, total, rejected and terminated connections. Docker health checks and Render/Fly checks use it |
| Bad configuration | Validated at startup with a clear message instead of a half-working server |
| Upstream library changes | Exact version pins and a lockfile, so a new release can't change behaviour underneath you |

The client side complements this: real handshake checks, exponential backoff, re-checks on network or visibility changes, failover across several servers, and transport rebuild after recovery.

## Security defaults

- **SSRF protection**: connections to private, loopback and link-local addresses are refused (including hostnames that *resolve* to them). Tests confirm `127.0.0.1` and `localhost` are blocked.
- **No destination logging**: only `LOG_LEVEL=debug` records hostnames.
- **Origin allow-list**: `ALLOWED_ORIGINS` stops other websites from using your server.
- Destination host and port allow/block lists via regexes and port ranges.

## Endpoints

| Path | Description |
|---|---|
| `/wisp/` | Wisp WebSocket endpoint (v1 and v2) |
| `/health` | JSON status (CORS-enabled, so the NOVA frontend can read it from another origin) |
| everything else | The frontend when `STATIC_DIR` is set, otherwise a short info page |

## Running it standalone

```bash
npm ci && npm run build -w server
PORT=8080 node server/dist/index.js     # Wisp-only mode
```

## Tests

`npm test -w server` runs 21 tests with real Wisp v1 and v2 clients proxying real TCP to a local echo server: concurrency (25 streams), 512 KB flow-controlled transfers, SSRF blocking, origin, per-IP and rate limits, trusted-proxy handling, dead-peer termination, garbage input, graceful shutdown and static hosting.
