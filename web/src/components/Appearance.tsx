import { useEffect, useState } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { settings, effectiveTheme, GRADIENTS } from "../state/settings";
import { activeTab } from "../state/tabs";
import { mediaStore } from "../lib/idb";
import { BASE } from "../proxy/runtime-config";

/** Removes constructs from user CSS that could load remote resources or run script. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "/* @import removed */")
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, "none /* external url removed */")
    .replace(/expression\s*\(/gi, "/* removed */(")
    .replace(/javascript:/gi, "")
    .replace(/behavior\s*:/gi, "/* removed */:")
    .replace(/<\/?style/gi, "");
}

function svgDataUrl(svg: string) {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const MONO_ICON = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color}"/><path d="M18 46V18h5.5l17 19.5V18H46v28h-5.5l-17-19.5V46z" fill="#fff"/></svg>`;
const DOT_ICON = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="${color}"/></svg>`;

/** Applies theme tokens, wallpaper, custom CSS, document title and favicon. Renders only the wallpaper layer. */
export function Appearance() {
  const [imageUrl, setImageUrl] = useState<string>("");
  const s = settings.value;
  const a = s.appearance;
  const theme = effectiveTheme.value;

  useSignalEffect(() => {
    const st = settings.value;
    const ap = st.appearance;
    const root = document.documentElement;
    root.dataset.theme = effectiveTheme.value;
    root.dataset.perf = st.performance.mode;
    root.dataset.font = ap.font;
    root.dataset.density = ap.density;
    root.dataset.glass = String(ap.glass && st.performance.mode !== "efficiency");
    root.style.setProperty("--accent", ap.accent);
    root.style.setProperty("--radius", `${ap.radius}px`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effectiveTheme.value === "light" ? "#e9ebf2" : "#10131c");
  });

  // Custom CSS (applies to NOVA's own interface only, never to proxied sites).
  useSignalEffect(() => {
    const css = settings.value.appearance.customCss;
    let el = document.getElementById("nova-custom-css") as HTMLStyleElement | null;
    if (!css.trim()) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "nova-custom-css";
      document.head.appendChild(el);
    }
    el.textContent = sanitizeCss(css);
  });

  // Wallpaper images live in IndexedDB (too large for localStorage).
  useEffect(() => {
    if (a.wallpaper.kind !== "image") {
      setImageUrl("");
      return;
    }
    let url = "";
    let cancelled = false;
    void mediaStore.get("wallpaper").then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setImageUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [a.wallpaper.kind, a.wallpaper.rev]);

  // Document title and favicon (tab presentation).
  useSignalEffect(() => {
    const p = settings.value.presentation;
    const tab = activeTab.value;
    const workspace = p.workspaceName.trim();
    let title: string;
    if (p.titleMode === "custom" && p.customTitle.trim()) title = p.customTitle.trim();
    else if (p.titleMode === "workspace") title = workspace || "NOVA";
    else title = workspace ? `${tab.title} · ${workspace}` : `${tab.title} · NOVA`;
    if (document.title !== title) document.title = title;

    const accent = settings.value.appearance.accent;
    const href =
      p.favicon === "custom" && p.customFavicon
        ? p.customFavicon
        : p.favicon === "mono"
          ? svgDataUrl(MONO_ICON(accent))
          : p.favicon === "dot"
            ? svgDataUrl(DOT_ICON(accent))
            : BASE + "favicon.svg";
    const link = document.getElementById("nova-favicon") as HTMLLinkElement | null;
    if (link && link.getAttribute("href") !== href) link.setAttribute("href", href);
  });

  let background = "none";
  if (a.wallpaper.kind === "gradient") {
    const g = GRADIENTS[a.wallpaper.gradient] ?? GRADIENTS.aurora!;
    background = theme === "light" ? g.light : g.dark;
  } else if (a.wallpaper.kind === "image" && imageUrl) {
    background = `url("${imageUrl}")`;
  }
  const blur = a.wallpaper.kind === "image" && s.performance.mode !== "efficiency" ? a.wallpaper.blur : 0;
  return (
    <div
      class={`wallpaper${blur ? " blurred" : ""}`}
      style={{
        "--wallpaper": background,
        "--wallpaper-dim": String(a.wallpaper.kind === "image" ? a.wallpaper.dim / 100 : 0),
        "--wallpaper-blur": `${blur}px`,
      }}
    />
  );
}
