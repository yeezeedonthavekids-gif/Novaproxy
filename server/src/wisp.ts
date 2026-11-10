/**
 * NOVA Wisp gateway.
 *
 * The Wisp protocol itself (multiplexing TCP/UDP streams over one WebSocket)
 * is handled by @mercuryworkshop/wisp-js, the reference implementation, pinned
 * to an exact version. This module wraps it with the operational hardening a
 * long-running public server needs:
 *
 *  - Origin allow-listing, global and per-IP connection caps, connect rate limiting
 *  - Heartbeats: peers that stop answering pings are terminated, so dead mobile
 *    and Wi-Fi connections never pile up and leak sockets/memory
 *  - TCP keep-alive + no-delay on the upgraded socket
 *  - SSRF protection (private/loopback destinations blocked by default)
 *  - Graceful drain on shutdown
 *  - Live statistics for /health without logging any destinations
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { BlockList, isIP } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { server as wisp, logging as wispLogging } from "@mercuryworkshop/wisp-js/server";
import type { NovaConfig } from "./config.js";
import type { Logger } from "./log.js";

interface Tracked {
  ws: WebSocket;
  ip: string;
  alive: boolean;
  openedAt: number;
}

export interface WispStats {
  activeConnections: number;
  totalConnections: number;
  rejectedConnections: number;
  terminatedDeadPeers: number;
  draining: boolean;
}

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  const body = reason + "\n";
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
      body,
  );
}

/** Builds a matcher for trusted proxy entries: exact IPs, CIDR ranges, or "*". */
export function createTrustMatcher(entries: string[]): (ip: string) => boolean {
  if (entries.includes("*")) return () => true;
  const list = new BlockList();
  for (const entry of entries) {
    const [addr, bits] = entry.split("/");
    const type = isIP(addr ?? "") === 6 ? "ipv6" : "ipv4";
    if (!isIP(addr ?? "")) continue;
    if (bits !== undefined) list.addSubnet(addr!, Number(bits), type);
    else list.addAddress(addr!, type);
  }
  return (ip: string) => {
    const plain = ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
    const type = isIP(plain);
    return type !== 0 && list.check(plain, type === 6 ? "ipv6" : "ipv4");
  };
}

/** WebSocket close code NOVA's client understands (4000-4999 is the application range). */
export const CLOSE_ORIGIN_NOT_ALLOWED = 4003;

export function resolveClientIp(req: IncomingMessage, isTrusted: (ip: string) => boolean): string {
  const remote = req.socket.remoteAddress ?? "unknown";
  if (!isTrusted(remote)) return remote;
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  if (first) return first;
  const real = req.headers["x-real-ip"];
  return (Array.isArray(real) ? real[0] : real)?.trim() || remote;
}

export class WispGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Tracked>();
  private readonly perIp = new Map<string, number>();
  private readonly rate = new Map<string, { count: number; windowStart: number }>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly rateSweep: NodeJS.Timeout;
  private draining = false;
  private readonly isTrusted: (ip: string) => boolean;
  private totalConnections = 0;
  private rejectedConnections = 0;
  private terminatedDeadPeers = 0;

  constructor(
    private readonly config: NovaConfig,
    private readonly log: Logger,
  ) {
    this.applyWispOptions();
    this.isTrusted = createTrustMatcher(config.trustedProxies);
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.maxPayloadBytes,
      perMessageDeflate: false, // compression costs CPU and most payloads are already TLS-encrypted
      clientTracking: false,
    });
    this.wss.on("error", (err) => this.log.error("websocket server error", { error: String(err) }));

    this.heartbeat = setInterval(() => this.beat(), config.heartbeatSeconds * 1000);
    this.heartbeat.unref();
    this.rateSweep = setInterval(() => this.sweepRate(), 60_000);
    this.rateSweep.unref();
  }

  private applyWispOptions() {
    const c = this.config;
    const o = wisp.options;
    o.allow_private_ips = c.allowPrivateIps;
    o.allow_loopback_ips = c.allowLoopbackIps;
    o.allow_direct_ip = c.allowDirectIp;
    o.allow_udp_streams = c.allowUdp;
    o.allow_tcp_streams = true;
    o.stream_limit_per_host = c.streamLimitPerHost;
    o.stream_limit_total = c.streamLimitTotal;
    o.hostname_blacklist = c.blockedHosts.length ? c.blockedHosts : null;
    o.hostname_whitelist = c.allowedHosts.length ? c.allowedHosts : null;
    o.port_blacklist = c.blockedPorts.length ? c.blockedPorts : null;
    o.port_whitelist = c.allowedPorts.length ? c.allowedPorts : null;
    o.dns_method = c.dnsMethod;
    o.dns_servers = c.dnsServers.length ? c.dnsServers : null;
    o.dns_result_order = c.dnsResultOrder;
    // NOVA resolves the client IP itself; wisp-js never needs it.
    o.parse_real_ip = false;
    o.wisp_version = 2;
    o.wisp_motd = c.motd;
    // wisp-js logs destination hostnames at INFO/WARN. Keep them out of the logs
    // unless the operator explicitly asks for debug output.
    wispLogging.set_level(c.logLevel === "debug" ? wispLogging.DEBUG : wispLogging.ERROR);
  }

  /** Returns true when the request targeted the Wisp endpoint (handled or rejected). */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      rejectUpgrade(socket, 400, "invalid url");
      return true;
    }
    if (pathname !== this.config.wispPath && pathname + "/" !== this.config.wispPath) return false;

    socket.on("error", () => socket.destroy());
    const ip = resolveClientIp(req, this.isTrusted);
    const reject = (status: number, reason: string) => {
      this.rejectedConnections++;
      this.log.debug("rejected wisp connection", { status, reason });
      rejectUpgrade(socket, status, reason);
      return true;
    };

    if (this.draining) return reject(503, "server is restarting");
    if (!this.consumeRate(ip)) return reject(429, "too many new connections, slow down");

    // Authorization failures complete the WebSocket handshake and then close with an
    // application code. Browsers can't read HTTP status codes on failed WebSocket
    // upgrades, and some reverse proxies (e.g. Tailscale Funnel) stall on them, so a
    // close code is the only way to tell the user *why* they were refused.
    const origin = (req.headers.origin ?? "").replace(/\/$/, "").toLowerCase();
    if (this.config.allowedOrigins.length && !this.config.allowedOrigins.includes(origin)) {
      this.log.warn("refused a site that isn't in ALLOWED_ORIGINS", { origin: origin || "(none)" });
      return this.refuse(req, socket, head, CLOSE_ORIGIN_NOT_ALLOWED, "This site is not allowed to use this server");
    }

    if (this.clients.size >= this.config.maxConnections) return reject(503, "server is at capacity");
    if ((this.perIp.get(ip) ?? 0) >= this.config.maxConnectionsPerIp) {
      return reject(429, "too many open connections from this address");
    }

    if ("setNoDelay" in socket && typeof socket.setNoDelay === "function") {
      (socket as import("node:net").Socket).setNoDelay(true);
      (socket as import("node:net").Socket).setKeepAlive(true, 30_000);
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const wispVersion = req.headers["sec-websocket-protocol"] ? 2 : 1;
      void this.attach(ws, ip, wispVersion);
    });
    return true;
  }

  private refuse(req: IncomingMessage, socket: Duplex, head: Buffer, code: number, reason: string): true {
    this.rejectedConnections++;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.close(code, reason);
      // Don't let a refused client hold the socket open.
      setTimeout(() => ws.terminate(), 2000).unref();
    });
    return true;
  }

  private async attach(ws: WebSocket, ip: string, wispVersion: 1 | 2) {
    const tracked: Tracked = { ws, ip, alive: true, openedAt: Date.now() };
    this.clients.add(tracked);
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
    this.totalConnections++;

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.clients.delete(tracked);
      const left = (this.perIp.get(ip) ?? 1) - 1;
      if (left <= 0) this.perIp.delete(ip);
      else this.perIp.set(ip, left);
    };

    ws.on("pong", () => {
      tracked.alive = true;
    });
    ws.on("close", release);
    ws.on("error", (err) => {
      this.log.debug("wisp socket error", { error: String(err) });
    });

    try {
      // NOVA runs its own heartbeat (with dead-peer detection), so wisp-js's
      // fire-and-forget ping loop is effectively disabled.
      const conn = new wisp.ServerConnection(ws, this.config.wispPath, {
        wisp_version: wispVersion,
        ping_interval: 86_400,
      });
      await conn.setup();
      await conn.run();
    } catch (err) {
      const name = (err as Error)?.constructor?.name;
      if (name !== "HandshakeError" && name !== "AccessDeniedError") {
        this.log.warn("wisp connection ended with an error", { error: String((err as Error)?.message ?? err) });
      }
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    } finally {
      release();
    }
  }

  private beat() {
    for (const client of this.clients) {
      if (!client.alive) {
        this.terminatedDeadPeers++;
        this.log.debug("terminating unresponsive wisp peer");
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch {
        client.ws.terminate();
      }
    }
  }

  private consumeRate(ip: string): boolean {
    const limit = this.config.connectRatePerMinute;
    if (limit === 0) return true;
    const now = Date.now();
    const entry = this.rate.get(ip);
    if (!entry || now - entry.windowStart >= 60_000) {
      this.rate.set(ip, { count: 1, windowStart: now });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  private sweepRate() {
    const now = Date.now();
    for (const [ip, entry] of this.rate) {
      if (now - entry.windowStart >= 60_000) this.rate.delete(ip);
    }
  }

  stats(): WispStats {
    return {
      activeConnections: this.clients.size,
      totalConnections: this.totalConnections,
      rejectedConnections: this.rejectedConnections,
      terminatedDeadPeers: this.terminatedDeadPeers,
      draining: this.draining,
    };
  }

  /** Stop accepting connections, ask clients to reconnect elsewhere, then force-close after the grace period. */
  async shutdown(graceMs: number): Promise<void> {
    this.draining = true;
    clearInterval(this.heartbeat);
    clearInterval(this.rateSweep);
    for (const client of this.clients) {
      try {
        client.ws.close(1012, "server restarting"); // 1012 = Service Restart: clients should reconnect
      } catch {
        client.ws.terminate();
      }
    }
    const deadline = Date.now() + graceMs;
    while (this.clients.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const client of this.clients) client.ws.terminate();
    this.clients.clear();
    this.wss.close();
  }
}
