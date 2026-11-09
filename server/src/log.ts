import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Tiny leveled logger. NOVA deliberately never logs destination hostnames,
 * URLs or payloads: the server only records operational events.
 */
export function createLogger(level: LogLevel, format: "pretty" | "json"): Logger {
  const threshold = ORDER[level];
  const emit = (lvl: Exclude<LogLevel, "silent">, msg: string, data?: Record<string, unknown>) => {
    if (ORDER[lvl] < threshold) return;
    const stream = lvl === "error" || lvl === "warn" ? process.stderr : process.stdout;
    if (format === "json") {
      stream.write(JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...data }) + "\n");
    } else {
      const extra = data && Object.keys(data).length ? " " + JSON.stringify(data) : "";
      stream.write(`${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra}\n`);
    }
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}
