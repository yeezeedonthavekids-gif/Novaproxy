import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// VITE_BASE lets NOVA be served from a sub-path (e.g. GitHub Pages: /Novaproxy/).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [preact()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    chunkSizeWarningLimit: 200,
  },
  server: {
    port: 5173,
    proxy: {
      // During development the Wisp server runs on :8080; proxy it so the
      // default same-origin Wisp URL works without configuration.
      "/wisp/": { target: "ws://localhost:8080", ws: true },
      "/health": { target: "http://localhost:8080" },
    },
  },
});
