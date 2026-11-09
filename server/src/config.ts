/**
 * Environment-driven configuration for the NOVA server.
 *
 * Every option has a safe default so `node dist/index.js` works with zero
 * configuration. Invalid values fail fast at startup with a clear message
 * instead of producing a half-working server.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface NovaConfig {
  host: string;
  port: number;
  /** URL path the Wisp endpoint is mounted on. Always starts and ends with "/". */
  wispPath: string;
  /** Directory of the built frontend to serve, or null for Wisp-only mode. */
  staticDir: string | null;
  logLevel: LogLevel;
  logFormat: "pretty" | "json";
  /** Allowed `Origin` headers for Wisp upgrades. Empty = allow all. */
  allowedOrigins: string[];
  maxConnections: number;
  maxConnectionsPerIp: number;
  /** New Wisp connections allowed per IP per minute. 0 disables the limit. */
  connectRatePerMinute: number;
  streamLimitPerHost: number;
  streamLimitTotal: number;
  allowUdp: boolean;
  allowPrivateIps: boolean;
  allowLoopbackIps: boolean;
  allowDirectIp: boolean;
  blockedHosts: RegExp[];
  allowedHosts: RegExp[];
  blockedPorts: Array<number | [number, number]>;
  allowedPorts: Array<number | [number, number]>;
  dnsMethod: "lookup" | "resolve";
  dnsServers: string[];
  dnsResultOrder: "ipv4first" | "ipv6first" | "verbatim";
  /** IPs (reverse proxies) whose X-Forwarded-For header is trusted. */
  trustedProxies: string[];
  /** Seconds between WebSocket pings. Dead peers are dropped after two missed pongs. */
  heartbeatSeconds: number;
  /** Seconds to wait for open connections to drain on shutdown. */
  shutdownGraceSeconds: number;
  /** Max size of a single WebSocket message in bytes. */
  maxPayloadBytes: number;
  motd: string | null;
}

class ConfigError extends Error {}

function str(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  throw new ConfigError(`${key} must be true or false (got "${raw}")`);
}

function list(env: NodeJS.ProcessEnv, key: string): string[] {
  const raw = env[key];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function regexList(env: NodeJS.ProcessEnv, key: string): RegExp[] {
  return list(env, key).map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch {
      throw new ConfigError(`${key} contains an invalid regular expression: ${pattern}`);
    }
  });
}

function portList(env: NodeJS.ProcessEnv, key: string): Array<number | [number, number]> {
  return list(env, key).map((entry) => {
    const range = entry.split("-").map((p) => Number(p.trim()));
    const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= 65535;
    if (range.length === 1 && valid(range[0]!)) return range[0]!;
    if (range.length === 2 && valid(range[0]!) && valid(range[1]!) && range[0]! <= range[1]!) {
      return [range[0]!, range[1]!] as [number, number];
    }
    throw new ConfigError(`${key} has an invalid port or range: "${entry}" (use 443 or 8000-9000)`);
  });
}

function normalizePath(path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (!p.endsWith("/")) p += "/";
  return p;
}

function oneOf<T extends string>(env: NodeJS.ProcessEnv, key: string, allowed: readonly T[], fallback: T): T {
  const value = str(env, key, fallback).toLowerCase() as T;
  if (!allowed.includes(value)) {
    throw new ConfigError(`${key} must be one of: ${allowed.join(", ")} (got "${env[key]}")`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): NovaConfig {
  const staticDir = str(env, "STATIC_DIR", "");
  const motd = str(env, "WISP_MOTD", "");
  return {
    host: str(env, "HOST", "0.0.0.0"),
    port: int(env, "PORT", 8080, 0, 65535),
    wispPath: normalizePath(str(env, "WISP_PATH", "/wisp/")),
    staticDir: staticDir || null,
    logLevel: oneOf(env, "LOG_LEVEL", ["debug", "info", "warn", "error", "silent"] as const, "info"),
    logFormat: oneOf(env, "LOG_FORMAT", ["pretty", "json"] as const, "pretty"),
    allowedOrigins: list(env, "ALLOWED_ORIGINS").map((o) => o.replace(/\/$/, "").toLowerCase()),
    maxConnections: int(env, "MAX_CONNECTIONS", 1000, 1, 1_000_000),
    maxConnectionsPerIp: int(env, "MAX_CONNECTIONS_PER_IP", 20, 1, 100_000),
    connectRatePerMinute: int(env, "CONNECT_RATE_PER_MINUTE", 60, 0, 1_000_000),
    streamLimitPerHost: int(env, "STREAM_LIMIT_PER_HOST", -1, -1, 100_000),
    streamLimitTotal: int(env, "STREAM_LIMIT_TOTAL", -1, -1, 1_000_000),
    allowUdp: bool(env, "ALLOW_UDP", true),
    allowPrivateIps: bool(env, "ALLOW_PRIVATE_IPS", false),
    allowLoopbackIps: bool(env, "ALLOW_LOOPBACK_IPS", false),
    allowDirectIp: bool(env, "ALLOW_DIRECT_IP", true),
    blockedHosts: regexList(env, "BLOCKED_HOSTS"),
    allowedHosts: regexList(env, "ALLOWED_HOSTS"),
    blockedPorts: portList(env, "BLOCKED_PORTS"),
    allowedPorts: portList(env, "ALLOWED_PORTS"),
    dnsMethod: oneOf(env, "DNS_METHOD", ["lookup", "resolve"] as const, "lookup"),
    dnsServers: list(env, "DNS_SERVERS"),
    dnsResultOrder: oneOf(env, "DNS_RESULT_ORDER", ["ipv4first", "ipv6first", "verbatim"] as const, "ipv4first"),
    trustedProxies: list(env, "TRUSTED_PROXIES").length
      ? list(env, "TRUSTED_PROXIES")
      : ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
    heartbeatSeconds: int(env, "HEARTBEAT_SECONDS", 25, 5, 3600),
    shutdownGraceSeconds: int(env, "SHUTDOWN_GRACE_SECONDS", 10, 0, 600),
    maxPayloadBytes: int(env, "MAX_PAYLOAD_BYTES", 1024 * 1024, 1024, 64 * 1024 * 1024),
    motd: motd || null,
  };
}

export { ConfigError };
