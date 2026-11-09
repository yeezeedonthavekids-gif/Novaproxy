// End-to-end tests: the real NOVA server (serving the production build) + a
// real browser + a local website as the proxy target. Nothing is mocked except
// the third-party game CDN, which is replaced by a local fixture.
//
// Run: npm run build && npm test -w web   (requires Playwright + Chromium)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startSite } from "./fixtures/site.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dist = path.join(root, "web/dist");
const serverDist = path.join(root, "server/dist/app.js");

let playwright = null;
try {
  playwright = createRequire(import.meta.url)("playwright");
} catch {
  /* optional */
}
const skip = !playwright ? "playwright is not installed" : !existsSync(dist) || !existsSync(serverDist) ? "run `npm run build` first" : false;

const GAME_HTML = `<!doctype html><html><head><title>Fixture Game</title></head><body>
<h1 id="game">Fixture game running</h1><p id="storage"></p>
<script>try { localStorage.setItem("g", "1"); document.getElementById("storage").textContent = "storage:ok"; }
catch (e) { document.getElementById("storage").textContent = "storage:blocked"; }</script></body></html>`;
const ZONES = [
  { id: -1, name: "[!] promo", cover: "{COVER_URL}/x.png", url: "https://example.com" },
  { id: 1, name: "Fixture Game", cover: "{COVER_URL}/1.png", url: "{HTML_URL}/fixture.html", author: "Tester", authorLink: "https://example.com", featured: true },
  { id: 2, name: "Another Game", cover: "{COVER_URL}/2.png", url: "{HTML_URL}/other.html", author: "Someone", special: ["flash"] },
];

describe("NOVA end-to-end", { skip }, () => {
  let site, server, browser, ctx, page, base, sitePort;

  before(async () => {
    const { loadConfig } = await import(path.join(root, "server/dist/config.js"));
    const { createLogger } = await import(path.join(root, "server/dist/log.js"));
    const { startServer } = await import(serverDist);
    site = await startSite();
    sitePort = site.address().port;
    // Loopback destinations are allowed ONLY for this test so the proxy can reach the local site.
    server = await startServer(
      loadConfig({ PORT: "0", HOST: "127.0.0.1", STATIC_DIR: dist, LOG_LEVEL: "silent", ALLOW_LOOPBACK_IPS: "true", ALLOW_PRIVATE_IPS: "true", SHUTDOWN_GRACE_SECONDS: "1" }),
      createLogger("silent", "pretty"),
    );
    base = `http://localhost:${server.port}/`;
    browser = await playwright.chromium.launch();
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("https://cdn.jsdelivr.net/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/zones.json")) return route.fulfill({ json: ZONES, headers: { "access-control-allow-origin": "*" } });
      if (url.endsWith("/fixture.html")) return route.fulfill({ body: GAME_HTML, contentType: "text/plain", headers: { "access-control-allow-origin": "*" } });
      return route.fulfill({ status: 404, body: "" });
    });
    page = await ctx.newPage();
    await page.goto(base);
    await page.waitForSelector(".omnibox");
  });

  after(async () => {
    await browser?.close();
    await server?.close();
    site?.close();
  });

  const go = async (url) => {
    await page.click(".omnibox-display");
    await page.keyboard.type(url);
    await page.keyboard.press("Enter");
  };
  const titleIs = (t) => page.waitForFunction((t) => document.querySelector(".tab.active .title")?.textContent === t, t, { timeout: 20000 });
  const activeFrame = async () => (await page.waitForSelector('.view.web[data-active="true"] iframe', { state: "attached" })).contentFrame();

  test("Wisp status reflects a real handshake", async () => {
    await page.waitForSelector(".status-btn .dot.online", { timeout: 15000 });
  });

  for (const engine of ["uv", "scramjet"]) {
    test(`${engine}: loads a site, runs scripts, follows links, back, forms`, async () => {
      await page.keyboard.press("Alt+T");
      await page.click('button[aria-label="Proxy engine"]');
      await page.click(`.popover .menu-item:has-text("${engine === "uv" ? "Ultraviolet" : "Scramjet"}")`);
      await go(`http://127.0.0.1:${sitePort}/`);
      const frame = await activeFrame();
      await frame.waitForSelector('#h[data-api="true"]', { timeout: 25000 });
      assert.equal(await page.textContent(".engine-pill"), engine === "uv" ? "UV" : "Scramjet");
      const src = await page.getAttribute('.view.web[data-active="true"] iframe', "src");
      assert.ok(src.startsWith(engine === "uv" ? "/uv/service/" : "/scram/service/"), src);
      await titleIs("Test Site Home");
      await frame.click("#next");
      await titleIs("Second Page");
      assert.ok(await page.isEnabled('button[aria-label="Back"]'));
      await page.click('button[aria-label="Back"]');
      await titleIs("Test Site Home");
      const f2 = await activeFrame();
      await f2.waitForSelector("#q");
      await f2.fill("#q", "nova");
      await f2.click("#go");
      await titleIs("Results");
      assert.match(await page.textContent(".omnibox-display"), /search\?q=nova/);
    });
  }

  test("favicon is captured through the proxy", async () => {
    await page.waitForFunction(() => document.querySelector(".tab.active .fav img")?.src.startsWith("data:image/png"), null, { timeout: 15000 });
  });

  test("target=_blank links open a NOVA tab instead of a browser window", async () => {
    await go(`http://127.0.0.1:${sitePort}/`);
    await titleIs("Test Site Home");
    const before = await page.$$eval(".tab", (t) => t.length);
    await (await activeFrame()).click("#blank");
    await page.waitForFunction((n) => document.querySelectorAll(".tab").length === n + 1, before, { timeout: 15000 });
  });

  test("keyboard shortcuts work while a proxied site has focus", async () => {
    await go(`http://127.0.0.1:${sitePort}/`);
    await titleIs("Test Site Home");
    const frame = await activeFrame();
    await frame.click("h1");
    const before = await page.$$eval(".tab", (t) => t.length);
    await page.keyboard.press("Alt+T");
    await page.waitForFunction((n) => document.querySelectorAll(".tab").length === n + 1, before);
    await page.keyboard.press("Alt+W");
    await page.waitForFunction((n) => document.querySelectorAll(".tab").length === n, before);
  });

  test("Ghost opens with its shortcut but never while typing", async () => {
    await page.keyboard.press("Alt+T");
    await page.click(".w-search input");
    await page.keyboard.press("Alt+G");
    await page.waitForTimeout(300);
    assert.equal(await page.$(".ghost-panel"), null, "Ghost must not open inside a text field");
    await page.click(".w-clock");
    await page.keyboard.press("Alt+G");
    await page.waitForSelector(".ghost-panel");
    assert.equal(await page.$$eval(".ghost-item", (i) => i.length), 3);
    await page.keyboard.press("3");
    await page.waitForSelector(".ghost-panel", { state: "detached" });
  });

  test("bookmarks: add via star, persist across reload, export and import", async () => {
    await go(`http://127.0.0.1:${sitePort}/second`);
    await titleIs("Second Page");
    await page.click('button[aria-label="Bookmark this page"]');
    await page.waitForSelector('.bm-item:has-text("Second Page")');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector('.bm-item:has-text("Second Page")');
    await go("nova://bookmarks");
    await page.waitForSelector(".bm-layout");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export HTML")')]);
    const html = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    assert.match(html, /NETSCAPE-Bookmark-file-1/);
    assert.match(html, /Second Page/);
    // Round-trip: import the exported file back.
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click('button:has-text("Import")')]);
    await chooser.setFiles({ name: "bookmarks.html", mimeType: "text/html", buffer: Buffer.from(html) });
    await page.waitForSelector('.toast:has-text("Imported 1 bookmarks")');
    // The original plus the imported copy are both found by search.
    await page.fill('input[aria-label="Search bookmarks"]', "Second");
    await page.waitForFunction(() => document.querySelectorAll('.bm-row').length === 2);
  });

  test("settings persist across reloads (theme preset)", async () => {
    await go("nova://settings");
    await page.click('.preset:has-text("Paper")');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector(".omnibox");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    await go("nova://settings");
    await page.click('.preset:has-text("Nova")');
  });

  test("games: catalog, search, player with strict and compatible isolation", async () => {
    await go("nova://games");
    await page.waitForSelector(".g-card .g-name");
    const names = await page.$$eval(".g-name", (n) => n.map((x) => x.textContent));
    assert.deepEqual(names.sort(), ["Another Game", "Fixture Game"], "promo/external entries are filtered out");
    await page.fill('input[aria-label="Search games"]', "fixture");
    await page.waitForFunction(() => document.querySelectorAll(".g-card").length === 1);
    await page.click(".g-card-main");
    const frame = await (await page.waitForSelector(".g-stage iframe")).contentFrame();
    await frame.waitForSelector("#game");
    assert.equal(await frame.textContent("#storage"), "storage:blocked", "strict isolation blocks NOVA storage");
    await page.click('.segmented button:has-text("Compatible")');
    const frame2 = await (await page.waitForSelector(".g-stage iframe")).contentFrame();
    await frame2.waitForSelector("#storage:has-text('storage:')");
    assert.equal(await frame2.textContent("#storage"), "storage:ok");
    await page.click('button:has-text("Library")');
    await page.click('.chip:has-text("Recently played")');
    await page.waitForSelector('.g-name:has-text("Fixture Game")');
  });

  test("Wisp outage shows NOVA's error page and recovery works", async () => {
    await go("nova://settings");
    await page.click('.settings-nav-item:has-text("Proxy")');
    await page.fill('input[aria-label="Add Wisp server"]', "ws://127.0.0.1:1/wisp/");
    await page.click('button:has-text("Add server")');
    await page.keyboard.press("Alt+T");
    await go(`http://127.0.0.1:${sitePort}/`);
    await page.waitForSelector(".error-page h1:has-text(\"Wisp\")", { timeout: 20000 });
    // Remove the dead server: NOVA falls back to the deployment default and the page loads on retry.
    await page.keyboard.press("Alt+,");
    await page.click('.settings-nav-item:has-text("Proxy")');
    await page.click('button[aria-label="Remove ws://127.0.0.1:1/wisp/"]');
    await page.waitForSelector(".status-btn .dot.online", { timeout: 15000 });
  });

  test("private session records no history", async () => {
    await page.click('button[aria-label="Menu"]');
    await page.click('.menu-item:has-text("Start private session")');
    await page.waitForSelector(".private-badge");
    await page.keyboard.press("Alt+T");
    await go(`http://127.0.0.1:${sitePort}/second?private=1`);
    await titleIs("Second Page");
    await page.waitForTimeout(1500);
    const urls = await page.evaluate(() => JSON.parse(localStorage.getItem("nova:history") || "[]").map((h) => h.url));
    assert.ok(urls.length > 0, "earlier (non-private) history is still there");
    assert.ok(!urls.some((u) => u.includes("private=1")), "private visit must not be stored");
  });

  test("no uncaught page errors during the run", async () => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await page.waitForTimeout(1500);
    assert.deepEqual(errors, []);
  });
});
