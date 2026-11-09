// Tiny local website used by the end-to-end tests as a proxy target.
import http from "node:http";

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<link rel="icon" href="/icon.svg"><style>body{font:16px system-ui;margin:40px;background:#fafafa;color:#111}a{color:#3355ff}</style></head>
<body>${body}</body></html>`;

const routes = {
  "/": () => page("Test Site Home", `<h1 id="h">Hello from the test site</h1>
    <p id="ua"></p>
    <a id="next" href="/second">Go to second page</a> ·
    <a id="blank" href="/second" target="_blank">Open in new tab</a> ·
    <a id="spa" href="#" onclick="history.pushState({}, '', '/spa-route'); document.title='SPA Route'; return false;">SPA route</a>
    <form action="/search" method="get"><input name="q" id="q"><button id="go">Search</button></form>
    <script>document.getElementById('ua').textContent = 'Script ran at ' + location.pathname; fetch('/api').then(r=>r.json()).then(j=>{document.getElementById('h').dataset.api=j.ok})</script>`),
  "/second": () => page("Second Page", `<h1 id="h">Second page</h1><a id="home" href="/">Back home</a>`),
  "/api": () => null,
};

export function startSite(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/api") {
        res.writeHead(200, { "content-type": "application/json", "set-cookie": "nova_test=1; Path=/" });
        return res.end(JSON.stringify({ ok: true }));
      }
      if (url.pathname === "/icon.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#e33"/></svg>');
      }
      if (url.pathname === "/search") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(page("Results", `<h1 id="h">Results for ${String(url.searchParams.get("q")).replace(/[<>&]/g, "")}</h1>`));
      }
      const r = routes[url.pathname];
      res.writeHead(r ? 200 : 404, { "content-type": "text/html" });
      res.end(r ? r() : page("Not found", "<h1>404</h1>"));
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const s = await startSite(Number(process.env.PORT || 9090));
  console.log("test site on", s.address().port);
}
