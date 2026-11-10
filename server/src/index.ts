#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, ConfigError } from "./config.js";
import { createLogger } from "./log.js";
import { startServer, VERSION } from "./app.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
  const log = createLogger(config.logLevel, config.logFormat);

  // A single unexpected exception in a socket callback must not take down every
  // user's connection. Log it and keep serving, but if errors storm (a real
  // bug or corrupted state) exit so the supervisor (Docker/systemd/PaaS) restarts us cleanly.
  let recentErrors: number[] = [];
  const onFatal = (kind: string) => (err: unknown) => {
    const now = Date.now();
    recentErrors = recentErrors.filter((t) => now - t < 60_000);
    recentErrors.push(now);
    log.error(`${kind}`, { error: err instanceof Error ? err.stack ?? err.message : String(err) });
    if (recentErrors.length > 25) {
      log.error("too many unexpected errors in one minute, exiting so the supervisor can restart");
      process.exit(1);
    }
  };
  process.on("uncaughtException", onFatal("uncaught exception"));
  process.on("unhandledRejection", onFatal("unhandled promise rejection"));

  const running = await startServer(config, log);
  log.info(`NOVA server v${VERSION} listening`, {
    address: `http://${config.host}:${running.port}`,
    wisp: config.wispPath,
    static: config.staticDir ?? "disabled (wisp-only mode)",
  });
  if (config.staticDir && !existsSync(path.join(config.staticDir, "index.html"))) {
    log.warn(`STATIC_DIR has no index.html: ${config.staticDir}. Run "npm run build" first, or check the path.`);
  }
  if (config.allowedOrigins.length === 0) {
    log.info("ALLOWED_ORIGINS is not set: any website may use this Wisp server");
  } else {
    log.info("Wisp server is limited to these sites", { origins: config.allowedOrigins });
  }

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`received ${signal}, draining connections`, { graceSeconds: config.shutdownGraceSeconds });
    const hardExit = setTimeout(() => process.exit(0), (config.shutdownGraceSeconds + 5) * 1000);
    hardExit.unref();
    await running.close();
    log.info("shutdown complete");
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((err) => {
  process.stderr.write(`Failed to start NOVA server: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
