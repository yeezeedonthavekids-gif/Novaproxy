// End-to-end tests for the NOVA Wisp server. These open real Wisp connections
// (using the reference wisp-js client) and proxy real TCP traffic to a local
// echo server - nothing is mocked.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { client as wispClient } from "@mercuryworkshop/wisp-js/client";
import { loadConfig } from "../dist/config.js";
import { createLogger } from "../dist/log.js";
import { startServer } from "../dist/app.js";

const silent = createLogger("silent", "pretty");

function makeConfig(env = {}) {
  return loadConfig({ PORT: "0", HOST: "127.0.0.1", LOG_LEVEL: "silent", SHUTDOWN_GRACE_SECONDS: "1", ...env });
}

function startEcho() {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => sock.pipe(sock));
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

function openWisp(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const conn = new wispClient.ClientConnection(url, opts);
    const timer = setTimeout(() => reject(new Error("wisp open timeout")), 5000);
    conn.onopen = () => {
      clearTimeout(timer);
      resolve(conn);
    };
    conn.onerror = () => {
      clearTimeout(timer);
      reject(new Error("wisp connection error"));
    };
  });
}

function echoRoundTrip(conn, port, text) {
  return new Promise((resolve, reject) => {
    const stream = conn.create_stream("127.0.0.1", port);
    let received = "";
    const timer = setTimeout(() => reject(new Error("echo timeout")), 5000);
    stream.onmessage = (data) => {
      received += new TextDecoder().decode(data);
      if (received.length >= text.length) {
        clearTimeout(timer);
        stream.close();
        resolve(received);
      }
    };
    stream.onclose = (reason) => {
      clearTimeout(timer);
      if (received.length < text.length) reject(new Error(`stream closed early (reason ${reason})`));
    };
    stream.send(new TextEncoder().encode(text));
  });
}

function streamCloseReason(conn, host, port) {
  return new Promise((resolve) => {
    const stream = conn.create_stream(host, port);
    stream.onclose = (reason) => resolve(reason);
    stream.send(new TextEncoder().encode("hi"));
  });
}

function rawUpgradeStatus(port, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/wisp/`, { headers });
    ws.on("open", () => {
      ws.close();
      resolve(101);
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode));
    ws.on("error", () => {});
  });
}

function getJson(port, p) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: p }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      })
      .on("error", reject);
  });
}

describe("wisp proxying", () => {
  let echo, running, url;
  before(async () => {
    echo = await startEcho();
    running = await startServer(makeConfig({ ALLOW_LOOPBACK_IPS: "true", ALLOW_PRIVATE_IPS: "true" }), silent);
    url = `ws://127.0.0.1:${running.port}/wisp/`;
  });
  after(async () => {
    await running.close();
    echo.close();
  });

  test("wisp v2 client proxies TCP data both ways", async () => {
    const conn = await openWisp(url);
    assert.equal(await echoRoundTrip(conn, echo.address().port, "hello nova"), "hello nova");
    conn.close();
  });

  test("wisp v1 client proxies TCP data both ways", async () => {
    const conn = await openWisp(url, { wisp_version: 1 });
    assert.equal(await echoRoundTrip(conn, echo.address().port, "v1 works"), "v1 works");
    conn.close();
  });

  test("many concurrent streams over one connection", async () => {
    const conn = await openWisp(url);
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => echoRoundTrip(conn, echo.address().port, `stream-${i}`)),
    );
    results.forEach((r, i) => assert.equal(r, `stream-${i}`));
    conn.close();
  });

  test("large payloads respect flow control", async () => {
    const conn = await openWisp(url);
    const big = "x".repeat(512 * 1024);
    const out = await echoRoundTrip(conn, echo.address().port, big);
    assert.equal(out.length, big.length);
    conn.close();
  });

  test("connections are tracked and released", async () => {
    const conn = await openWisp(url);
    assert.ok(running.gateway.stats().activeConnections >= 1);
    conn.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(running.gateway.stats().activeConnections, 0);
  });

  test("health endpoint reports status", async () => {
    const res = await getJson(running.port, "/health");
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "ok");
    assert.equal(data.wispPath, "/wisp/");
    assert.equal(res.headers["access-control-allow-origin"], "*");
  });

  test("unknown upgrade paths are refused", async () => {
    const status = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${running.port}/not-wisp/`);
      ws.on("unexpected-response", (_q, res) => resolve(res.statusCode));
      ws.on("error", () => resolve("error"));
    });
    assert.equal(status, 404);
  });
});

describe("security defaults", () => {
  let echo, running, url;
  before(async () => {
    echo = await startEcho();
    running = await startServer(makeConfig(), silent);
    url = `ws://127.0.0.1:${running.port}/wisp/`;
  });
  after(async () => {
    await running.close();
    echo.close();
  });

  test("loopback destinations are blocked by default (SSRF protection)", async () => {
    const conn = await openWisp(url);
    const reason = await streamCloseReason(conn, "127.0.0.1", echo.address().port);
    assert.equal(reason, 0x48); // HostBlocked
    conn.close();
  });

  test("hostname resolving to loopback is blocked too", async () => {
    const conn = await openWisp(url);
    const reason = await streamCloseReason(conn, "localhost", echo.address().port);
    assert.equal(reason, 0x48);
    conn.close();
  });
});

describe("limits", () => {
  test("origin allow-list", async () => {
    const running = await startServer(makeConfig({ ALLOWED_ORIGINS: "https://nova.example" }), silent);
    try {
      assert.equal(await rawUpgradeStatus(running.port, { Origin: "https://evil.example" }), 403);
      assert.equal(await rawUpgradeStatus(running.port, { Origin: "https://nova.example/" }), 101);
    } finally {
      await running.close();
    }
  });

  test("per-IP connection cap", async () => {
    const running = await startServer(makeConfig({ MAX_CONNECTIONS_PER_IP: "2" }), silent);
    const url = `ws://127.0.0.1:${running.port}/wisp/`;
    try {
      const a = await openWisp(url);
      const b = await openWisp(url);
      assert.equal(await rawUpgradeStatus(running.port), 429);
      a.close();
      b.close();
    } finally {
      await running.close();
    }
  });

  test("connect rate limit", async () => {
    const running = await startServer(makeConfig({ CONNECT_RATE_PER_MINUTE: "3" }), silent);
    try {
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push(await rawUpgradeStatus(running.port));
      assert.deepEqual(statuses, [101, 101, 101, 429, 429]);
    } finally {
      await running.close();
    }
  });
});

describe("resilience", () => {
  test("unresponsive peers are terminated by the heartbeat", async () => {
    const running = await startServer(makeConfig({ HEARTBEAT_SECONDS: "5" }), silent);
    try {
      // A client that never answers pings (autoPong disabled) simulates a dead network.
      const ws = new WebSocket(`ws://127.0.0.1:${running.port}/wisp/`, { autoPong: false });
      await new Promise((r) => ws.on("open", r));
      const closed = new Promise((r) => ws.on("close", r));
      assert.equal(running.gateway.stats().activeConnections, 1);
      await closed; // closes after ~2 heartbeat intervals
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(running.gateway.stats().activeConnections, 0);
      assert.equal(running.gateway.stats().terminatedDeadPeers, 1);
    } finally {
      await running.close();
    }
  });

  test("garbage frames do not crash the server", async () => {
    const running = await startServer(makeConfig(), silent);
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${running.port}/wisp/`);
      await new Promise((r) => ws.on("open", r));
      ws.send(Buffer.from([0xff, 0x00, 0x01]));
      ws.send("not binary");
      ws.send(Buffer.alloc(0));
      await new Promise((r) => setTimeout(r, 200));
      ws.terminate();
      const conn = await openWisp(`ws://127.0.0.1:${running.port}/wisp/`);
      conn.close();
      assert.equal((await getJson(running.port, "/health")).status, 200);
    } finally {
      await running.close();
    }
  });

  test("graceful shutdown closes clients with 1012 (service restart)", async () => {
    const running = await startServer(makeConfig(), silent);
    const ws = new WebSocket(`ws://127.0.0.1:${running.port}/wisp/`);
    await new Promise((r) => ws.on("open", r));
    const code = new Promise((r) => ws.on("close", (c) => r(c)));
    await running.close();
    assert.equal(await code, 1012);
  });
});

describe("static hosting", () => {
  let running, dir;
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "nova-static-"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>NOVA</title>");
    writeFileSync(path.join(dir, "sw.js"), "// sw");
    running = await startServer(makeConfig({ STATIC_DIR: dir }), silent);
  });
  after(() => running.close());

  test("serves index and SPA fallback", async () => {
    assert.match((await getJson(running.port, "/")).body, /NOVA/);
    assert.match((await getJson(running.port, "/games")).body, /NOVA/);
  });

  test("blocks path traversal", async () => {
    const res = await getJson(running.port, "/..%2f..%2fetc%2fpasswd");
    assert.equal(res.status, 404);
  });

  test("service worker is never cached", async () => {
    const res = await getJson(running.port, "/sw.js");
    assert.equal(res.headers["cache-control"], "no-cache");
  });
});
