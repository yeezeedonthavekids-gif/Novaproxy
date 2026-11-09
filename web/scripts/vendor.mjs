// Copies the proxy engine runtimes and Wisp transports from node_modules into
// public/ so they are served as standalone files (service workers and the
// bare-mux SharedWorker must load them by URL, they cannot be bundled).
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, "../public");


function pkgDir(name) {
  // Resolve the package.json location, walking up from this workspace (handles hoisting).
  let dir = path.resolve(here, "..");
  while (true) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot find package ${name}. Run npm install first.`);
    dir = parent;
  }
}


const jobs = [
  ["@titaniumnetwork-dev/ultraviolet", "dist", "uv/vendor", ["uv.bundle.js", "uv.client.js", "uv.handler.js", "uv.sw.js"]],
  ["@mercuryworkshop/scramjet", "dist", "scram/vendor", ["scramjet.all.js", "scramjet.sync.js", "scramjet.wasm.wasm"]],
  ["@mercuryworkshop/bare-mux", "dist", "baremux", ["worker.js", "index.js"]],
  ["@mercuryworkshop/epoxy-transport", "dist", "transports/epoxy", ["index.mjs"]],
  ["@mercuryworkshop/libcurl-transport", "dist", "transports/libcurl", ["index.mjs"]],
];

for (const [pkg, sub, dest, files] of jobs) {
  const from = path.join(pkgDir(pkg), sub);
  const to = path.join(pub, dest);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of files) cpSync(path.join(from, f), path.join(to, f));
}
console.log("[nova] proxy runtimes copied to public/");
