/**
 * Minimal, dependency-free static file server for the built NOVA frontend.
 *
 * - Path traversal safe
 * - Serves pre-compressed .br/.gz siblings when the client accepts them
 * - Long-lived caching for content-hashed assets, revalidation for everything else
 * - SPA fallback to index.html for unknown, extension-less routes
 */
import { createReadStream, promises as fs, type Stats } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Files that must always be revalidated (service workers, configs, entry HTML). */
const NO_CACHE = /(^|\/)(index\.html|sw\.js|uv\.config\.js|nova\.config\.json|manifest\.webmanifest)$/;
/** Vite emits content-hashed file names under /assets/. */
const IMMUTABLE = /^\/assets\//;

export function createStaticHandler(rootDir: string) {
  const root = path.resolve(rootDir);

  async function stat(file: string): Promise<Stats | null> {
    try {
      const s = await fs.stat(file);
      return s.isFile() ? s : null;
    } catch {
      return null;
    }
  }

  return async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      return false;
    }
    if (pathname.includes("\0")) return false;

    let file = path.join(root, pathname);
    if (file !== root && !file.startsWith(root + path.sep)) return false; // traversal attempt
    if (pathname.endsWith("/")) file = path.join(file, "index.html");

    let info = await stat(file);
    let servedPath = pathname;
    if (!info && !path.extname(pathname)) {
      // SPA fallback for client-side routes
      file = path.join(root, "index.html");
      servedPath = "/index.html";
      info = await stat(file);
    }
    if (!info) return false;

    const ext = path.extname(file).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": IMMUTABLE.test(servedPath)
        ? "public, max-age=31536000, immutable"
        : NO_CACHE.test(servedPath)
          ? "no-cache"
          : "public, max-age=3600",
    };
    if (servedPath.endsWith("/sw.js")) headers["Service-Worker-Allowed"] = path.posix.dirname(servedPath) + "/";

    // Pre-compressed variants produced by the frontend build.
    const accept = String(req.headers["accept-encoding"] ?? "");
    let body = file;
    let size = info.size;
    for (const [enc, suffix] of [["br", ".br"], ["gzip", ".gz"]] as const) {
      if (!accept.includes(enc)) continue;
      const compressed = await stat(file + suffix);
      if (compressed) {
        body = file + suffix;
        size = compressed.size;
        headers["Content-Encoding"] = enc;
        headers["Vary"] = "Accept-Encoding";
        break;
      }
    }

    const etag = `W/"${size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    headers["ETag"] = etag;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    headers["Content-Length"] = String(size);
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    const stream = createReadStream(body);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
    return true;
  };
}
