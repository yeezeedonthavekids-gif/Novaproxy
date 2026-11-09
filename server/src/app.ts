import http from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { NovaConfig } from "./config.js";
import type { Logger } from "./log.js";
import { WispGateway } from "./wisp.js";
import { createStaticHandler } from "./static.js";

const VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return String(pkg.version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
})();

export interface RunningServer {
  server: http.Server;
  gateway: WispGateway;
  port: number;
  close(): Promise<void>;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "interest-cohort=()",
};

export async function startServer(config: NovaConfig, log: Logger): Promise<RunningServer> {
  const gateway = new WispGateway(config, log);
  const serveStatic = config.staticDir ? createStaticHandler(config.staticDir) : null;
  const startedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const pathname = (req.url ?? "/").split("?")[0];

    if (pathname === "/health" || pathname === "/healthz") {
      const stats = gateway.stats();
      const body = JSON.stringify({
        status: stats.draining ? "draining" : "ok",
        service: "nova-wisp",
        version: VERSION,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        wispPath: config.wispPath,
        wisp: stats,
      });
      res.writeHead(stats.draining ? 503 : 200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
      return;
    }

    if (serveStatic) {
      try {
        if (await serveStatic(req, res)) return;
      } catch (err) {
        log.error("static file error", { error: String(err) });
        if (!res.headersSent) res.writeHead(500);
        res.end();
        return;
      }
    } else if (pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`NOVA Wisp server v${VERSION} is running.\nWisp endpoint: ${config.wispPath}\nHealth: /health\n`);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
  });

  // Sensible timeouts so slowloris-style clients cannot hold sockets forever.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000; // longer than common load balancer idle timeouts
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });

  server.on("upgrade", (req, socket, head) => {
    if (!gateway.handleUpgrade(req, socket, head)) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;

  let closing: Promise<void> | null = null;
  return {
    server,
    gateway,
    port,
    close() {
      closing ??= (async () => {
        server.close();
        await gateway.shutdown(config.shutdownGraceSeconds * 1000);
        server.closeAllConnections();
      })();
      return closing;
    },
  };
}

export { VERSION };
