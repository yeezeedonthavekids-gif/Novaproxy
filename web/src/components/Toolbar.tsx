import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { activeTab, navigate, newTab, sendCommand } from "../state/tabs";
import { settings, updateSettings, searchTemplate, SEARCH_ENGINES, type ToolbarButton, type EngineId } from "../state/settings";
import { findByUrl, allLinks } from "../state/bookmarks";
import { history } from "../state/history";
import { downloads } from "../state/downloads";
import { privateMode } from "../state/session";
import { wispStatus, checkWisp, wispLabel } from "../proxy/wisp";
import { ENGINES, prepareEngine } from "../proxy/index";
import { displayUrl, internalPage, isInternal, resolveInput, searchUrl, INTERNAL_PAGES } from "../lib/url";
import { ACTIONS, focusAddressRequest, ghostOpen, openPage, toggleBookmark } from "../lib/actions";
import { prettyCombo } from "../lib/keys";
import { recordPreference } from "../lib/engine-memory";
import { Icon, type IconName } from "./Icon";
import { Popover } from "./ui";
import { BookmarkIcon } from "./BookmarkBar";

interface Suggestion {
  kind: "go" | "search" | "bookmark" | "history" | "page";
  url: string;
  title: string;
  icon: IconName | null;
  favicon?: string;
}

function buildSuggestions(text: string): Suggestion[] {
  const q = text.trim();
  if (!q) return [];
  const template = searchTemplate.value;
  const target = resolveInput(q, template);
  const out: Suggestion[] = [];
  const searchTarget = searchUrl(q, template);
  const isSearch = target === searchTarget;
  if (!isSearch) out.push({ kind: "go", url: target, title: displayUrl(target), icon: "globe" });
  const engineName = SEARCH_ENGINES.find((e) => e.id === settings.value.search.engine)?.name ?? settings.value.search.custom.find((c) => c.id === settings.value.search.engine)?.name ?? "the web";
  out.push({ kind: "search", url: searchTarget, title: `${q} — search ${engineName}`, icon: "search" });
  const lower = q.toLowerCase();
  if (lower.startsWith("nova") || lower.length >= 2) {
    for (const p of INTERNAL_PAGES) {
      if (p !== "newtab" && `nova://${p}`.includes(lower)) out.push({ kind: "page", url: `nova://${p}`, title: `nova://${p}`, icon: "sparkle" });
    }
  }
  const seen = new Set(out.map((s) => s.url));
  for (const b of allLinks.value) {
    if (out.length > 9) break;
    if (!seen.has(b.url!) && (b.title.toLowerCase().includes(lower) || b.url!.toLowerCase().includes(lower))) {
      seen.add(b.url!);
      out.push({ kind: "bookmark", url: b.url!, title: b.title, icon: null, favicon: b.icon });
    }
  }
  for (const h of history.value) {
    if (out.length > 9) break;
    if (!seen.has(h.url) && (h.title.toLowerCase().includes(lower) || h.url.toLowerCase().includes(lower))) {
      seen.add(h.url);
      out.push({ kind: "history", url: h.url, title: h.title, icon: "clock", favicon: h.favicon });
    }
  }
  return out;
}

function Omnibox() {
  const tab = activeTab.value;
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => (focused ? buildSuggestions(text) : []), [focused, text]);

  useSignalEffect(() => {
    if (focusAddressRequest.value > 0) inputRef.current?.focus();
  });

  const startEdit = () => {
    const initial = tab.url === "nova://home" || tab.url === "nova://newtab" ? "" : tab.url;
    // Set the DOM value synchronously so keystrokes typed right after focusing are never lost.
    if (inputRef.current) {
      inputRef.current.value = initial;
      if (initial) inputRef.current.select();
    }
    setText(initial);
    setSel(0);
    setFocused(true);
    // Warm up the proxy while the user types (skipped in Efficiency mode).
    if (settings.peek().performance.mode !== "efficiency") void prepareEngine(tab.engine).catch(() => {});
  };

  const go = (url: string) => {
    navigate(tab.id, url);
    setFocused(false);
    inputRef.current?.blur();
  };

  const submit = () => {
    const pick = suggestions[sel];
    go(pick && sel > 0 ? pick.url : resolveInput(text, searchTemplate.peek()));
  };

  const internal = isInternal(tab.url);
  let host = "";
  let rest = "";
  if (!internal) {
    try {
      const u = new URL(tab.url);
      host = u.host.replace(/^www\./, "");
      rest = (u.pathname === "/" ? "" : u.pathname) + u.search + u.hash;
    } catch {
      host = tab.url;
    }
  }
  const secure = tab.url.startsWith("https:");

  return (
    <div class="omnibox">
      <div class={`omnibox-field${focused ? " focused" : ""}`} onMouseDown={(e) => {
        // Clicks on the engine switch must reach its buttons instead of focusing the input.
        if ((e.target as Element).closest?.(".engine-toggle")) return;
        if (!focused && e.target !== inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}>
        <span class="omnibox-lead">
          {focused ? (
            <Icon name="search" size={15} />
          ) : internal ? (
            <Icon name="sparkle" size={15} />
          ) : (
            <span class={secure ? "secure" : ""} title={secure ? "Encrypted connection to the site (TLS runs inside your browser)" : "This site does not use HTTPS: the Wisp server can see its traffic"}>
              <Icon name={secure ? "lock" : "unlock"} size={14} />
            </span>
          )}
        </span>
        <input
          ref={inputRef}
          aria-label="Address and search bar"
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          placeholder={focused ? "Search or enter an address" : ""}
          value={focused ? text : ""}
          style={focused ? undefined : { position: "absolute", opacity: 0, width: 1, pointerEvents: "none" }}
          onFocus={startEdit}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setFocused(false);
              inputRef.current?.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            }
          }}
        />
        {!focused && (
          <div class="omnibox-display" onClick={() => inputRef.current?.focus()}>
            {internal ? (
              tab.url === "nova://home" || tab.url === "nova://newtab" ? (
                <span class="faint">Search or enter an address</span>
              ) : (
                <span class="url-host">{tab.url}</span>
              )
            ) : (
              <>
                <span class="url-host">{host}</span>
                <span class="url-rest">{rest}</span>
              </>
            )}
          </div>
        )}
        {!internal && !focused && <EnginePill />}
      </div>
      {focused && suggestions.length > 0 && (
        <div class="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s.kind + s.url}
              class="suggestion"
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => {
                e.preventDefault();
                go(s.url);
              }}
              onMouseEnter={() => setSel(i)}
            >
              {s.icon ? <Icon name={s.icon} size={15} /> : <BookmarkIcon icon={s.favicon} title={s.title} url={s.url} />}
              <span class="s-title">{s.title}</span>
              {(s.kind === "bookmark" || s.kind === "history") && <span class="s-url">{displayUrl(s.url)}</span>}
              <span class="s-kind">{{ go: "Go", search: "Search", bookmark: "Bookmark", history: "History", page: "NOVA" }[s.kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One-click engine switch in the address bar. Picking an engine reloads the page
 * with it and remembers the choice for that site (used by Auto mode).
 */
function EnginePill() {
  const tab = activeTab.value;
  const auto = settings.value.proxy.autoEngine;
  const pick = (id: EngineId) => {
    if (id === tab.engine) return;
    recordPreference(tab.url, id);
    navigate(tab.id, tab.url, id);
  };
  return (
    <div class="engine-toggle" role="group" aria-label="Proxy engine for this site" title={auto ? "Auto picks the engine that works best for each site. Click to choose one yourself." : "Proxy engine for this site"}>
      {auto && <span class="engine-auto">Auto</span>}
      <button aria-pressed={tab.engine === "uv"} onClick={() => pick("uv")} title="Ultraviolet">
        UV
      </button>
      <button aria-pressed={tab.engine === "scramjet"} onClick={() => pick("scramjet")} title="Scramjet">
        SJ
      </button>
    </div>
  );
}

function EngineMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const tab = activeTab.value;
  const s = settings.value;
  const pick = (id: EngineId) => {
    updateSettings((d) => (d.proxy.engine = id));
    if (!isInternal(tab.url) && tab.engine !== id) navigate(tab.id, tab.url, id);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <button class="menu-item" style={{ height: "auto", padding: "8px 10px", alignItems: "flex-start" }} onClick={() => updateSettings((d) => (d.proxy.autoEngine = !d.proxy.autoEngine))}>
        <Icon name={s.proxy.autoEngine ? "check" : "sparkle"} />
        <span>
          <strong>Auto</strong>
          <div class="hint">Remembers which engine works best for each site and switches automatically if a page fails or is slow.</div>
        </span>
      </button>
      <div class="menu-sep" />
      <div class="menu-label">{s.proxy.autoEngine ? "Default for new sites" : "Proxy engine"}</div>
      {(Object.keys(ENGINES) as EngineId[]).map((id) => (
        <button class="menu-item" style={{ height: "auto", padding: "8px 10px", alignItems: "flex-start" }} key={id} onClick={() => pick(id)}>
          <Icon name={(isInternal(tab.url) ? s.proxy.engine : tab.engine) === id ? "check" : "bolt"} />
          <span>
            <strong>{ENGINES[id].name}</strong>
            <div class="hint">{ENGINES[id].description}</div>
          </span>
        </button>
      ))}
      <div class="menu-sep" />
      <div class="menu-label">Transport</div>
      {(["epoxy", "libcurl"] as const).map((t) => (
        <button class="menu-item" key={t} onClick={() => (updateSettings((d) => (d.proxy.transport = t)), onClose())}>
          <Icon name={s.proxy.transport === t ? "check" : "lock"} />
          {t === "epoxy" ? "Epoxy (TLS in WebAssembly)" : "libcurl.js (TLS in WebAssembly)"}
        </button>
      ))}
      <div class="hint" style={{ padding: "6px 10px" }}>
        Pages that don't work in one engine often work in the other. The choice becomes the default for new tabs.
      </div>
    </Popover>
  );
}

function StatusButton() {
  const st = wispStatus.value;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = { unknown: "Wisp: idle", checking: "Connecting…", online: st.latency != null ? `${st.latency} ms` : "Online", offline: "Offline" }[st.state];
  return (
    <>
      <button class="status-btn" data-optional="true" aria-label={`Wisp server status: ${st.state}`} title="Wisp server status" onClick={(e) => setAnchor(anchor ? null : (e.currentTarget as HTMLElement))}>
        <span class={`dot ${st.state}`} />
        <span>{label}</span>
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={320}>
          <div style={{ padding: "8px 10px" }}>
            <div class="row">
              <span class={`dot ${st.state}`} />
              <strong>{st.state === "online" ? "Connected to Wisp server" : st.state === "offline" ? "Wisp server unreachable" : st.state === "checking" ? "Checking connection…" : "Not checked yet"}</strong>
            </div>
            <div class="faint" style={{ marginTop: 6, wordBreak: "break-all" }}>{wispLabel(st.url || st.candidates[0] || "")}</div>
            {st.state === "online" && <div class="hint" style={{ marginTop: 6 }}>Handshake latency {st.latency} ms · checked {new Date(st.checkedAt).toLocaleTimeString()}</div>}
            {st.state === "offline" && (
              <>
                <div class="error-text" style={{ marginTop: 6 }}>{st.error}</div>
                {st.nextRetryAt && <div class="hint">Retrying automatically…</div>}
              </>
            )}
            <div class="row" style={{ marginTop: 12 }}>
              <button class="btn sm" onClick={() => void checkWisp()}>
                <Icon name="reload" size={14} /> Check now
              </button>
              <button class="btn sm ghost" onClick={() => (openPage("privacy"), setAnchor(null))}>
                Privacy
              </button>
              <button class="btn sm ghost" onClick={() => (openPage("diagnostics"), setAnchor(null))}>
                Diagnostics
              </button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

function MainMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const sc = settings.value.shortcuts;
  const item = (icon: IconName, label: string, run: () => void, combo?: string) => (
    <button class="menu-item" onClick={() => (run(), onClose())}>
      <Icon name={icon} />
      {label}
      {combo && <span class="kbd">{prettyCombo(combo)}</span>}
    </button>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      {item("plus", "New tab", () => newTab(), sc.newTab)}
      {item(privateMode.value ? "eye" : "eyeOff", privateMode.value ? "End private session" : "Start private session", () => (privateMode.value = !privateMode.peek()))}
      {item("ghost", "Ghost quick navigation", () => (ghostOpen.value = true), settings.value.ghost.enabled ? sc.ghost : undefined)}
      <div class="menu-sep" />
      {item("bookmark", "Bookmarks", () => openPage("bookmarks"), sc.openBookmarks)}
      {item("clock", "History", () => openPage("history"), sc.openHistory)}
      {item("download", "Downloads", () => openPage("downloads"))}
      {item("gamepad", "Games", () => openPage("games"), sc.openGames)}
      <div class="menu-sep" />
      {item("shieldCheck", "Privacy dashboard", () => openPage("privacy"))}
      {item("activity", "Diagnostics", () => openPage("diagnostics"))}
      {item("keyboard", "Keyboard shortcuts", () => openPage("shortcuts"))}
      {item("gear", "Settings", () => openPage("settings"), sc.openSettings)}
      <div class="menu-sep" />
      {item("expand", "Fullscreen", ACTIONS.toggleFullscreen, sc.toggleFullscreen)}
      {item("layout", settings.value.presentation.minimal ? "Exit minimal mode" : "Minimal mode", ACTIONS.toggleMinimal, sc.toggleMinimal)}
    </Popover>
  );
}

export function Toolbar() {
  const tab = activeTab.value;
  const s = settings.value;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [engineAnchor, setEngineAnchor] = useState<HTMLElement | null>(null);
  const internal = isInternal(tab.url);
  const bookmarked = !internal && !!findByUrl(tab.url);
  const activeDownloads = downloads.value.filter((d) => d.status === "downloading").length;

  useEffect(() => setMenuAnchor(null), [tab.id]);

  const render = (id: ToolbarButton) => {
    switch (id) {
      case "back":
        return (
          <button class="icon-btn" aria-label="Back" title="Back" disabled={internal || !tab.canBack} onClick={() => sendCommand(tab.id, "back")}>
            <Icon name="back" />
          </button>
        );
      case "forward":
        return (
          <button class="icon-btn" aria-label="Forward" title="Forward" disabled={internal || !tab.canForward} onClick={() => sendCommand(tab.id, "forward")}>
            <Icon name="forward" />
          </button>
        );
      case "reload":
        return tab.loading ? (
          <button class="icon-btn" aria-label="Stop loading" title="Stop" onClick={() => sendCommand(tab.id, "stop")}>
            <Icon name="stop" />
          </button>
        ) : (
          <button class="icon-btn" aria-label="Reload" title="Reload" disabled={internal} onClick={() => sendCommand(tab.id, "reload")}>
            <Icon name="reload" />
          </button>
        );
      case "home":
        return (
          <button class="icon-btn" aria-label="Home" title="Home" onClick={() => navigate(tab.id, s.homepage || "nova://home")}>
            <Icon name="home" />
          </button>
        );
      case "bookmark":
        return (
          <button class={`icon-btn${bookmarked ? " on" : ""}`} aria-label={bookmarked ? "Remove bookmark" : "Bookmark this page"} title={bookmarked ? "Remove bookmark" : "Bookmark this page"} disabled={internal} onClick={toggleBookmark}>
            <Icon name="star" filled={bookmarked} />
          </button>
        );
      case "games":
        return (
          <button class={`icon-btn${internalPage(tab.url) === "games" ? " on" : ""}`} data-optional="true" aria-label="Games" title="Games" onClick={() => openPage("games")}>
            <Icon name="gamepad" />
          </button>
        );
      case "downloads":
        return (
          <button class="icon-btn" data-optional="true" aria-label="Downloads" title={activeDownloads ? `${activeDownloads} downloading` : "Downloads"} onClick={() => openPage("downloads")}>
            <Icon name="download" />
          </button>
        );
      case "engine":
        return (
          <>
            <button class="icon-btn" data-optional="true" aria-label="Proxy engine" title={`Default engine: ${ENGINES[s.proxy.engine].name}`} onClick={(e) => setEngineAnchor(engineAnchor ? null : (e.currentTarget as HTMLElement))}>
              <Icon name="bolt" />
            </button>
            {engineAnchor && <EngineMenu anchor={engineAnchor} onClose={() => setEngineAnchor(null)} />}
          </>
        );
      case "status":
        return <StatusButton />;
    }
  };

  const visible = s.layout.toolbar.filter((b) => b.visible).map((b) => b.id);
  const navIds: ToolbarButton[] = ["back", "forward", "reload", "home"];
  const left = visible.filter((id) => navIds.includes(id));
  const right = visible.filter((id) => !navIds.includes(id));

  return (
    <div class="toolbar">
      {left.map((id) => (
        <span key={id} style={{ display: "contents" }}>
          {render(id)}
        </span>
      ))}
      <Omnibox />
      {right.map((id) => (
        <span key={id} style={{ display: "contents" }}>
          {render(id)}
        </span>
      ))}
      <button class="icon-btn" aria-label="Menu" title="Menu" onClick={(e) => setMenuAnchor(menuAnchor ? null : (e.currentTarget as HTMLElement))}>
        <Icon name="dots" />
      </button>
      {menuAnchor && <MainMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}
    </div>
  );
}
