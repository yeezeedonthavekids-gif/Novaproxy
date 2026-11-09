// Pre-compresses text assets in dist/ (gzip + brotli) so the NOVA server can
// serve them without spending CPU on every request. Static hosts that compress
// on their own simply ignore these files.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const TEXT = /\.(js|mjs|css|html|json|svg|wasm|webmanifest|txt)$/;
let count = 0;
let saved = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) walk(file);
    else if (TEXT.test(name) && info.size > 1024) {
      const data = readFileSync(file);
      const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
      const gz = gzipSync(data, { level: 9 });
      if (br.length < data.length) writeFileSync(file + ".br", br);
      if (gz.length < data.length) writeFileSync(file + ".gz", gz);
      count++;
      saved += data.length - br.length;
    }
  }
}
walk(dist);
console.log(`[nova] pre-compressed ${count} files (${(saved / 1024 / 1024).toFixed(1)} MB smaller with brotli)`);
