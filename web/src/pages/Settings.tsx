import { useEffect, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import {
  settings,
  updateSettings,
  applyPreset,
  setPerfMode,
  resetSettings,
  exportSettings,
  importSettings,
  PRESETS,
  GRADIENTS,
  SEARCH_ENGINES,
  SLEEP_DEFAULTS,
  type ToolbarButton,
  type WidgetId,
  type PerfMode,
} from "../state/settings";
import { mediaStore } from "../lib/idb";
import { uid } from "../lib/storage";
import { safeHttpUrl } from "../lib/url";
import { normalizeWispUrl, defaultWispUrl } from "../proxy/runtime-config";
import { probeWisp, wispStatus, checkWisp, wispLabel } from "../proxy/wisp";
import { ENGINES } from "../proxy/index";
import { openPage, settingsSection } from "../lib/actions";
import { engineMemorySize, forgetEngineMemory } from "../lib/engine-memory";
import { Icon, type IconName } from "../components/Icon";
import { Section, SettingRow, Switch, Segmented, toast, askForm, confirmAction, downloadText, pickFile, imageToIcon } from "../components/ui";
import { ShortcutEditor, ShortcutList } from "./Shortcuts";
import "../styles/settings.css";

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "home", label: "Home & layout", icon: "layout" },
  { id: "performance", label: "Performance", icon: "cpu" },
  { id: "proxy", label: "Proxy & connection", icon: "bolt" },
  { id: "search", label: "Search", icon: "search" },
  { id: "ghost", label: "Ghost", icon: "ghost" },
  { id: "presentation", label: "Tab presentation", icon: "sparkle" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
  { id: "games", label: "Games", icon: "gamepad" },
  { id: "data", label: "Backup & reset", icon: "upload" },
];

const ACCENTS = ["#8b7bff", "#5b8cff", "#22b8cf", "#3ddc84", "#f5b83d", "#ff7a59", "#ff5d8f", "#c06bff", "#a5a8b8"];
const TOOLBAR_LABELS: Record<ToolbarButton, string> = {
  back: "Back",
  forward: "Forward",
  reload: "Reload",
  home: "Home",
  bookmark: "Bookmark star",
  engine: "Engine selector",
  status: "Connection status",
  games: "Games",
  downloads: "Downloads",
};
const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: "Clock",
  search: "Search box",
  quicklinks: "Quick links",
  recent: "Recently visited",
  games: "Continue playing",
  notes: "Notes",
  bookmarks: "Bookmarks",
  weather: "Weather (via proxy)",
};

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
}

function Appearance() {
  const a = settings.value.appearance;
  const perf = settings.value.performance.mode;
  return (
    <>
      <Section title="Presets" desc="A starting point. Everything below can still be adjusted.">
        <div class="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} class={`preset${a.preset === p.id ? " on" : ""}`} onClick={() => applyPreset(p.id)}>
              <span class={`preset-swatch theme-${p.apply.theme}`} style={{ "--sw": p.apply.accent }}>
                <i />
                <i />
                <i />
              </span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Theme">
        <SettingRow title="Color mode">
          <Segmented
            label="Color mode"
            value={a.theme}
            onChange={(v) => updateSettings((s) => (s.appearance.theme = v))}
            options={[
              { value: "dark", label: "Dark", icon: "moon" },
              { value: "light", label: "Light", icon: "sun" },
              { value: "system", label: "System", icon: "cpu" },
            ]}
          />
        </SettingRow>
        <SettingRow title="Accent color">
          <div class="swatches">
            {ACCENTS.map((c) => (
              <button key={c} class={`swatch${a.accent.toLowerCase() === c ? " on" : ""}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => updateSettings((s) => (s.appearance.accent = c))} />
            ))}
            <label class="swatch custom" title="Custom color">
              <input type="color" value={a.accent} onInput={(e) => updateSettings((s) => (s.appearance.accent = e.currentTarget.value))} aria-label="Custom accent color" />
              <Icon name="plus" size={14} />
            </label>
          </div>
        </SettingRow>
        <SettingRow title="Font" desc="Uses fonts already on your device: nothing is downloaded.">
          <select class="select" style={{ width: 180 }} value={a.font} onChange={(e) => updateSettings((s) => (s.appearance.font = e.currentTarget.value as typeof a.font))}>
            <option value="system">System (Inter if installed)</option>
            <option value="humanist">Humanist</option>
            <option value="geometric">Geometric</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </SettingRow>
        <SettingRow title="Corner roundness" desc={`${a.radius}px`}>
          <input type="range" min={0} max={24} value={a.radius} onInput={(e) => updateSettings((s) => (s.appearance.radius = Number(e.currentTarget.value)))} aria-label="Corner roundness" />
        </SettingRow>
        <SettingRow title="Density">
          <Segmented
            label="Density"
            value={a.density}
            onChange={(v) => updateSettings((s) => (s.appearance.density = v))}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </SettingRow>
        <SettingRow title="Glass effects" desc={perf === "efficiency" ? "Unavailable in Efficiency mode (background blur is GPU-intensive)." : "Translucent, blurred surfaces. Costs GPU time on integrated graphics."}>
          <Switch label="Glass effects" checked={a.glass && perf !== "efficiency"} onChange={(v) => perf !== "efficiency" && updateSettings((s) => (s.appearance.glass = v))} />
        </SettingRow>
      </Section>
      <Wallpaper />
      <Section title="Custom CSS" desc="Applies to NOVA's interface only, never to websites. @import and external url() are removed so styles can't load trackers.">
        <div style={{ padding: 14 }}>
          <textarea
            class="textarea mono"
            spellcheck={false}
            placeholder={".tab.active { font-weight: 700; }\n:root { --radius: 20px; }"}
            value={a.customCss}
            onInput={(e) => updateSettings((s) => (s.appearance.customCss = e.currentTarget.value))}
            style={{ minHeight: 120 }}
            aria-label="Custom CSS"
          />
        </div>
      </Section>
    </>
  );
}

function Wallpaper() {
  const w = settings.value.appearance.wallpaper;
  const perf = settings.value.performance.mode;
  const upload = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast("Please choose an image under 15 MB", { icon: "alert" });
    await mediaStore.set("wallpaper", file);
    updateSettings((s) => {
      s.appearance.wallpaper.kind = "image";
      s.appearance.wallpaper.rev = Date.now();
    });
    toast("Wallpaper updated", { icon: "check" });
  };
  return (
    <Section title="Wallpaper" desc="Images are stored in this browser only.">
      <div class="wall-grid">
        <button class={`wall${w.kind === "none" ? " on" : ""}`} onClick={() => updateSettings((s) => (s.appearance.wallpaper.kind = "none"))}>
          <span class="wall-preview plain" />
          None
        </button>
        {Object.entries(GRADIENTS).map(([id, g]) => (
          <button
            key={id}
            class={`wall${w.kind === "gradient" && w.gradient === id ? " on" : ""}`}
            onClick={() => updateSettings((s) => Object.assign(s.appearance.wallpaper, { kind: "gradient", gradient: id }))}
          >
            <span class="wall-preview" style={{ background: `${g.dark}, #0b0d14` }} />
            {g.name}
          </button>
        ))}
        <button class={`wall${w.kind === "image" ? " on" : ""}`} onClick={() => void upload()}>
          <span class="wall-preview plain upload">
            <Icon name="upload" size={18} />
          </span>
          {w.kind === "image" ? "Replace image" : "Your image"}
        </button>
      </div>
      {w.kind === "image" && (
        <>
          <SettingRow title="Dim" desc={`${w.dim}%`}>
            <input type="range" min={0} max={85} value={w.dim} onInput={(e) => updateSettings((s) => (s.appearance.wallpaper.dim = Number(e.currentTarget.value)))} aria-label="Dim wallpaper" />
          </SettingRow>
          <SettingRow title="Blur" desc={perf === "efficiency" ? "Disabled in Efficiency mode." : `${w.blur}px · blur costs GPU time`}>
            <input type="range" min={0} max={24} value={w.blur} disabled={perf === "efficiency"} onInput={(e) => updateSettings((s) => (s.appearance.wallpaper.blur = Number(e.currentTarget.value)))} aria-label="Blur wallpaper" />
          </SettingRow>
          <SettingRow title="Remove image">
            <button
              class="btn sm danger"
              onClick={() => {
                void mediaStore.delete("wallpaper");
                updateSettings((s) => (s.appearance.wallpaper.kind = "gradient"));
              }}
            >
              Remove
            </button>
          </SettingRow>
        </>
      )}
    </Section>
  );
}

function HomeLayout() {
  const s = settings.value;
  return (
    <>
      <Section title="Home page">
        <SettingRow title="Layout">
          <Segmented
            label="Home layout"
            value={s.layout.home}
            onChange={(v) => updateSettings((d) => (d.layout.home = v))}
            options={[
              { value: "centered", label: "Centered" },
              { value: "dashboard", label: "Dashboard" },
              { value: "minimal", label: "Minimal" },
            ]}
          />
        </SettingRow>
        <SettingRow title="Homepage" desc="Used by the Home button and Ghost's “My homepage”. Use nova://home or any web address.">
          <input
            class="input"
            style={{ width: 260 }}
            value={s.homepage}
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              const ok = v.startsWith("nova://") ? v : safeHttpUrl(v) ?? safeHttpUrl("https://" + v);
              if (!ok) return toast("Enter nova://home or a web address", { icon: "alert" });
              updateSettings((d) => (d.homepage = ok));
            }}
            aria-label="Homepage"
          />
        </SettingRow>
        <SettingRow title="New tab page">
          <Segmented
            label="New tab page"
            value={s.presentation.newTab}
            onChange={(v) => updateSettings((d) => (d.presentation.newTab = v))}
            options={[
              { value: "dashboard", label: "Dashboard" },
              { value: "clean", label: "Clean" },
            ]}
          />
        </SettingRow>
      </Section>
      <Section title="Widgets" desc="Choose, order and size the widgets on your home page. You can also drag them on the home page with “Edit layout”.">
        {s.layout.widgets.map((w, i) => (
          <div class="list-row" key={w.id}>
            <Switch label={WIDGET_LABELS[w.id]} checked={w.enabled} onChange={(v) => updateSettings((d) => (d.layout.widgets[i]!.enabled = v))} />
            <span class="list-row-label">{WIDGET_LABELS[w.id]}</span>
            <Segmented
              label={`${WIDGET_LABELS[w.id]} size`}
              value={w.size}
              onChange={(v) => updateSettings((d) => (d.layout.widgets[i]!.size = v))}
              options={[
                { value: "s", label: "S" },
                { value: "m", label: "M" },
                { value: "l", label: "L" },
              ]}
            />
            <button class="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => updateSettings((d) => move(d.layout.widgets, i, i - 1))}>
              <Icon name="chevronDown" size={14} class="flip" />
            </button>
            <button class="icon-btn sm" aria-label="Move down" disabled={i === s.layout.widgets.length - 1} onClick={() => updateSettings((d) => move(d.layout.widgets, i, i + 1))}>
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
        ))}
      </Section>
      <Section title="Weather widget" desc="Optional. Requests go through your Wisp relay, so Open-Meteo never sees your IP address.">
        <SettingRow title="City">
          <input class="input" style={{ width: 200 }} value={s.weather.city} placeholder="e.g. Chicago" onChange={(e) => updateSettings((d) => (d.weather.city = e.currentTarget.value.trim()))} aria-label="Weather city" />
        </SettingRow>
        <SettingRow title="Units">
          <Segmented label="Units" value={s.weather.unit} onChange={(v) => updateSettings((d) => (d.weather.unit = v))} options={[{ value: "c", label: "°C" }, { value: "f", label: "°F" }]} />
        </SettingRow>
      </Section>
      <Section title="Toolbar" desc="Show, hide and reorder toolbar buttons. Navigation buttons sit left of the address bar, the rest on the right.">
        <SettingRow title="Bookmarks bar">
          <Switch label="Bookmarks bar" checked={s.layout.showBookmarkBar} onChange={(v) => updateSettings((d) => (d.layout.showBookmarkBar = v))} />
        </SettingRow>
        {s.layout.toolbar.map((b, i) => (
          <div class="list-row" key={b.id}>
            <Switch label={TOOLBAR_LABELS[b.id]} checked={b.visible} onChange={(v) => updateSettings((d) => (d.layout.toolbar[i]!.visible = v))} />
            <span class="list-row-label">{TOOLBAR_LABELS[b.id]}</span>
            <button class="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => updateSettings((d) => move(d.layout.toolbar, i, i - 1))}>
              <Icon name="chevronDown" size={14} class="flip" />
            </button>
            <button class="icon-btn sm" aria-label="Move down" disabled={i === s.layout.toolbar.length - 1} onClick={() => updateSettings((d) => move(d.layout.toolbar, i, i + 1))}>
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
        ))}
      </Section>
    </>
  );
}

const PERF_INFO: Record<PerfMode, { title: string; icon: IconName; points: string[] }> = {
  efficiency: { title: "Efficiency", icon: "bolt", points: ["No animations or blur", "Background tabs sleep after 5 min", "Games unload when you switch tabs", "No proxy warm-up"] },
  balanced: { title: "Balanced", icon: "activity", points: ["Short, cheap transitions", "Tabs sleep after 20 min", "Games keep running briefly in the background", "Proxy warms up when you type"] },
  visual: { title: "Visual", icon: "sparkle", points: ["Richer motion and hover effects", "Tabs sleep after 60 min", "Glass and wallpaper blur available", "Still no constant background work"] },
};

function Performance() {
  const p = settings.value.performance;
  return (
    <>
      <Section title="Performance profile" desc={p.autoDetected ? "NOVA picked this profile from what your browser reports about your device. Change it any time." : undefined}>
        <div class="perf-grid">
          {(Object.keys(PERF_INFO) as PerfMode[]).map((m) => (
            <button key={m} class={`perf-card${p.mode === m ? " on" : ""}`} onClick={() => setPerfMode(m)} aria-pressed={p.mode === m}>
              <span class="perf-title">
                <Icon name={PERF_INFO[m].icon} size={16} /> {PERF_INFO[m].title}
                {p.mode === m && <Icon name="check" size={15} class="perf-check" />}
              </span>
              <ul>
                {PERF_INFO[m].points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Memory">
        <SettingRow title="Put background tabs to sleep after" desc="Sleeping tabs free their memory and reload when you return to them. Pinned tabs never sleep.">
          <select
            class="select"
            style={{ width: 160 }}
            value={String(p.tabSleepMinutes)}
            onChange={(e) => updateSettings((s) => (s.performance.tabSleepMinutes = Number(e.currentTarget.value)))}
          >
            {[2, 5, 10, 20, 30, 60, 120, 0].map((m) => (
              <option key={m} value={String(m)}>
                {m === 0 ? "Never" : `${m} minutes${m === SLEEP_DEFAULTS[p.mode] ? " (default)" : ""}`}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Live measurements" desc="See real memory and responsiveness numbers in Diagnostics.">
          <button class="btn sm" onClick={() => openPage("diagnostics")}>
            Open diagnostics
          </button>
        </SettingRow>
      </Section>
    </>
  );
}

function ProxySettings() {
  const s = settings.value;
  const st = wispStatus.value;
  const [fallback, setFallback] = useState("");
  const [input, setInput] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  useEffect(() => void defaultWispUrl().then(setFallback), []);

  const test = async (url: string) => {
    setTesting(url);
    const r = await probeWisp(url);
    setResults((x) => ({ ...x, [url]: r.ok ? `✓ Wisp handshake OK · ${r.latency} ms` : `✗ ${r.error}` }));
    setTesting(null);
  };
  const add = async () => {
    const url = normalizeWispUrl(input);
    if (!/^wss?:\/\//.test(url)) return toast("Enter a ws:// or wss:// address", { icon: "alert" });
    if (s.proxy.wispServers.includes(url)) return toast("That server is already in the list", { icon: "info" });
    updateSettings((d) => d.proxy.wispServers.push(url));
    setInput("");
    void test(url);
  };

  return (
    <>
      <Section title="Engine" desc="Both engines use the same connection; they differ in how well they handle each site.">
        <SettingRow
          title="Choose automatically (Auto)"
          desc={`Remembers which engine loads each site best and switches by itself if a page fails or is slow. Learned ${engineMemorySize()} site${engineMemorySize() === 1 ? "" : "s"} so far, stored only on this device.`}
        >
          <Switch label="Auto engine" checked={s.proxy.autoEngine} onChange={(v) => updateSettings((d) => (d.proxy.autoEngine = v))} />
          <button class="btn sm ghost" onClick={() => (forgetEngineMemory(), toast("Forgot learned engine choices"))}>
            Reset
          </button>
        </SettingRow>
      </Section>
      <Section title={s.proxy.autoEngine ? "Default for new sites" : "Default engine"} desc="Switch any page with the UV | SJ buttons in the address bar.">
        {(Object.values(ENGINES)).map((e) => (
          <SettingRow key={e.id} title={e.name} desc={e.description}>
            <button class={`btn sm${s.proxy.engine === e.id ? " primary" : ""}`} onClick={() => updateSettings((d) => (d.proxy.engine = e.id))}>
              {s.proxy.engine === e.id ? "Default" : "Make default"}
            </button>
          </SettingRow>
        ))}
        <SettingRow title="Transport" desc="Both encrypt HTTPS end-to-end inside your browser (TLS in WebAssembly), so the Wisp server only relays encrypted bytes.">
          <Segmented
            label="Transport"
            value={s.proxy.transport}
            onChange={(v) => updateSettings((d) => (d.proxy.transport = v))}
            options={[
              { value: "epoxy", label: "Epoxy" },
              { value: "libcurl", label: "libcurl.js" },
            ]}
          />
        </SettingRow>
      </Section>
      <Section
        title="Wisp servers"
        desc="NOVA uses the first reachable server in this list and fails over automatically. Leave the list empty to use the deployment default."
        actions={
          <button class="btn sm" onClick={() => void checkWisp()}>
            <Icon name="reload" size={14} /> Re-check
          </button>
        }
      >
        {st.notConfigured && (
          <div class="list-row notice">
            <Icon name="info" size={16} />
            <span class="list-row-label" style={{ whiteSpace: "normal" }}>
              <strong>This site has no Wisp server.</strong> Static hosts (Netlify, Vercel, Cloudflare Pages, GitHub Pages) can't run one. Deploy the NOVA server on Docker, Render or a VPS and add
              its <code>wss://…/wisp/</code> address below.
            </span>
          </div>
        )}
        <div class="list-row">
          <span class={`dot ${st.state}`} />
          <span class="list-row-label">
            <strong>{st.state === "online" ? "Connected" : st.state === "offline" ? "Unreachable" : st.state === "checking" ? "Checking…" : "Idle"}</strong>
            <span class="faint" style={{ marginLeft: 8 }}>{wispLabel(st.url)}</span>
          </span>
          {st.latency != null && <span class="badge ok">{st.latency} ms</span>}
        </div>
        {s.proxy.wispServers.length === 0 && (
          <div class="list-row">
            <Icon name="cloud" size={16} />
            <span class="list-row-label">
              Built-in relay <span class="faint">(provided by this site)</span>
            </span>
            <button class="btn sm" disabled={testing === fallback} onClick={() => void test(fallback)}>
              Test
            </button>
          </div>
        )}
        {s.proxy.wispServers.map((url, i) => (
          <div class="list-row" key={url}>
            <span class="badge">{i + 1}</span>
            <span class="list-row-label mono">{url}</span>
            <button class="btn sm" disabled={testing === url} onClick={() => void test(url)}>
              {testing === url ? "Testing…" : "Test"}
            </button>
            <button class="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => updateSettings((d) => move(d.proxy.wispServers, i, i - 1))}>
              <Icon name="chevronDown" size={14} class="flip" />
            </button>
            <button class="icon-btn sm" aria-label={`Remove ${url}`} onClick={() => updateSettings((d) => d.proxy.wispServers.splice(i, 1))}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        {Object.entries(results).map(([url, r]) => (
          <div class="list-row hint" key={url}>
            <span class="mono">{wispLabel(url)}</span> <span class={r.startsWith("✓") ? "" : "error-text"}>{r}</span>
          </div>
        ))}
        <form
          class="list-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input class="input" placeholder="wss://your-server.example.com/wisp/" value={input} onInput={(e) => setInput(e.currentTarget.value)} aria-label="Add Wisp server" />
          <button class="btn sm primary" type="submit" disabled={!input.trim()}>
            Add server
          </button>
        </form>
      </Section>
    </>
  );
}

function SearchSettings() {
  const s = settings.value.search;
  const addCustom = async () => {
    const r = await askForm("Add search engine", [
      { key: "name", label: "Name", placeholder: "My search" },
      { key: "url", label: "Search URL (use %s for the query)", placeholder: "https://example.com/search?q=%s", type: "url" },
    ]);
    if (!r) return;
    const url = r.url!.trim();
    if (!safeHttpUrl(url.replace("%s", "test"))) return toast("Enter a valid http(s) URL", { icon: "alert" });
    if (!url.includes("%s")) return toast("The URL needs %s where the search terms go", { icon: "alert" });
    const id = "custom-" + uid();
    updateSettings((d) => {
      d.search.custom.push({ id, name: r.name!.trim() || new URL(url.replace("%s", "x")).hostname, url });
      d.search.engine = id;
    });
  };
  return (
    <Section title="Search engine" desc="Searches go to the engine through your proxy. NOVA doesn't send keystrokes anywhere for suggestions; suggestions come from your local bookmarks and history.">
      {[...SEARCH_ENGINES, ...s.custom].map((e) => (
        <div class="list-row" key={e.id}>
          <input type="radio" name="engine" id={`se-${e.id}`} checked={s.engine === e.id} onChange={() => updateSettings((d) => (d.search.engine = e.id))} />
          <label class="list-row-label" for={`se-${e.id}`}>
            {e.name} <span class="faint mono" style={{ marginLeft: 6 }}>{new URL(e.url.replace("%s", "q")).hostname}</span>
          </label>
          {e.id.startsWith("custom-") && (
            <button
              class="icon-btn sm"
              aria-label={`Remove ${e.name}`}
              onClick={() =>
                updateSettings((d) => {
                  d.search.custom = d.search.custom.filter((c) => c.id !== e.id);
                  if (d.search.engine === e.id) d.search.engine = "duckduckgo";
                })
              }
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      ))}
      <div class="list-row">
        <button class="btn sm" onClick={() => void addCustom()}>
          <Icon name="plus" size={14} /> Add custom engine
        </button>
      </div>
    </Section>
  );
}

function GhostSettings() {
  const g = settings.value.ghost;
  const addDest = async () => {
    const r = await askForm("Add Ghost destination", [
      { key: "label", label: "Name", placeholder: "Math homework" },
      { key: "url", label: "Address (web URL or nova:// page)", placeholder: "https://…", type: "url" },
    ]);
    if (!r) return;
    const raw = r.url!.trim();
    const url = raw.startsWith("nova://") ? raw : safeHttpUrl(raw) ?? safeHttpUrl("https://" + raw);
    if (!url) return toast("Enter a valid address", { icon: "alert" });
    updateSettings((d) => d.ghost.destinations.push({ id: uid(), label: r.label!.trim() || url, url }));
  };
  return (
    <>
      <Section title="Ghost quick navigation" desc="One shortcut to jump to the places you use most: Google Classroom, your homepage, or a fresh tab. Ghost never fires while you're typing in a text field.">
        <SettingRow title="Enable Ghost">
          <Switch label="Enable Ghost" checked={g.enabled} onChange={(v) => updateSettings((d) => (d.ghost.enabled = v))} />
        </SettingRow>
        <SettingRow title="Shortcut" desc="Change it under Shortcuts below.">
          <ShortcutEditor action="ghost" />
        </SettingRow>
        <SettingRow title="When pressed">
          <Segmented
            label="Ghost mode"
            value={g.mode}
            onChange={(v) => updateSettings((d) => (d.ghost.mode = v))}
            options={[
              { value: "overlay", label: "Show overlay" },
              { value: "immediate", label: "Go to default instantly" },
            ]}
          />
        </SettingRow>
        <SettingRow title="Open web destinations" desc="“Directly” leaves NOVA and opens the site in this browser tab with your normal sign-in.">
          <Segmented
            label="Open destinations in"
            value={g.openIn}
            onChange={(v) => updateSettings((d) => (d.ghost.openIn = v))}
            options={[
              { value: "tab", label: "In a NOVA tab" },
              { value: "window", label: "Directly" },
            ]}
          />
        </SettingRow>
        <SettingRow title="Allow while typing" desc="Off by default so the shortcut can't fire by accident inside text boxes.">
          <Switch label="Allow Ghost in text fields" checked={g.allowInInputs} onChange={(v) => updateSettings((d) => (d.ghost.allowInInputs = v))} />
        </SettingRow>
      </Section>
      <Section title="Destinations" actions={<button class="btn sm" onClick={() => void addDest()}><Icon name="plus" size={14} /> Add</button>}>
        {g.destinations.map((d, i) => (
          <div class="list-row" key={d.id}>
            <input type="radio" name="ghost-default" checked={g.defaultId === d.id} onChange={() => updateSettings((s) => (s.ghost.defaultId = d.id))} aria-label={`Make ${d.label} the default`} title="Default destination" />
            <span class="list-row-label">
              {d.label} <span class="faint mono" style={{ marginLeft: 6 }}>{d.url === "$homepage" ? "your homepage" : d.url}</span>
            </span>
            <button class="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => updateSettings((s) => move(s.ghost.destinations, i, i - 1))}>
              <Icon name="chevronDown" size={14} class="flip" />
            </button>
            <button
              class="icon-btn sm"
              aria-label={`Remove ${d.label}`}
              disabled={g.destinations.length <= 1}
              onClick={() =>
                updateSettings((s) => {
                  s.ghost.destinations.splice(i, 1);
                  if (s.ghost.defaultId === d.id) s.ghost.defaultId = s.ghost.destinations[0]!.id;
                })
              }
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </Section>
    </>
  );
}

function Presentation() {
  const p = settings.value.presentation;
  const uploadIcon = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    const data = await imageToIcon(file, 64);
    updateSettings((s) => Object.assign(s.presentation, { favicon: "custom", customFavicon: data }));
  };
  return (
    <>
      <Section title="Workspace" desc="Name your NOVA workspace and decide how the browser tab looks. NOVA never imitates other websites' names or icons.">
        <SettingRow title="Workspace name">
          <input class="input" style={{ width: 220 }} placeholder="e.g. Study" value={p.workspaceName} onInput={(e) => updateSettings((s) => (s.presentation.workspaceName = e.currentTarget.value))} aria-label="Workspace name" />
        </SettingRow>
        <SettingRow title="Browser tab title">
          <Segmented
            label="Tab title"
            value={p.titleMode}
            onChange={(v) => updateSettings((s) => (s.presentation.titleMode = v))}
            options={[
              { value: "page", label: "Current page" },
              { value: "workspace", label: "Workspace" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </SettingRow>
        {p.titleMode === "custom" && (
          <SettingRow title="Custom title">
            <input class="input" style={{ width: 220 }} value={p.customTitle} onInput={(e) => updateSettings((s) => (s.presentation.customTitle = e.currentTarget.value))} aria-label="Custom title" />
          </SettingRow>
        )}
        <SettingRow title="Tab icon">
          <div class="row" style={{ flexWrap: "wrap" }}>
            <Segmented
              label="Tab icon"
              value={p.favicon}
              onChange={(v) => (v === "custom" && !p.customFavicon ? void uploadIcon() : updateSettings((s) => (s.presentation.favicon = v)))}
              options={[
                { value: "default", label: "NOVA" },
                { value: "mono", label: "Accent" },
                { value: "dot", label: "Dot" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {p.favicon === "custom" && (
              <button class="btn sm" onClick={() => void uploadIcon()}>
                {p.customFavicon && <img src={p.customFavicon} alt="" width={16} height={16} />} Upload image
              </button>
            )}
          </div>
        </SettingRow>
      </Section>
      <Section title="Presentation mode">
        <SettingRow title="Minimal mode" desc="Hides the tab strip and toolbars. Move the pointer to the top edge, or press the shortcut, to bring them back.">
          <Switch label="Minimal mode" checked={p.minimal} onChange={(v) => updateSettings((s) => (s.presentation.minimal = v))} />
        </SettingRow>
        <SettingRow title="Clean new tab" desc="New tabs show only a search box instead of the dashboard.">
          <Switch label="Clean new tab" checked={p.newTab === "clean"} onChange={(v) => updateSettings((s) => (s.presentation.newTab = v ? "clean" : "dashboard"))} />
        </SettingRow>
      </Section>
    </>
  );
}

function GamesSettings() {
  const g = settings.value.games;
  return (
    <Section title="Games">
      <SettingRow
        title="Default isolation"
        desc="Isolated runs games in a sandbox with no access to NOVA's data (some games can't save or won't start). Compatible lets games use storage but they share NOVA's origin."
      >
        <Segmented
          label="Game isolation"
          value={g.isolation}
          onChange={(v) => updateSettings((s) => (s.games.isolation = v))}
          options={[
            { value: "strict", label: "Isolated" },
            { value: "compatible", label: "Compatible" },
          ]}
        />
      </SettingRow>
    </Section>
  );
}

function DataSettings() {
  return (
    <>
      <Section title="Backup">
        <SettingRow title="Export settings" desc="Saves your appearance, layout, shortcuts and preferences to a file (no history or bookmarks).">
          <button class="btn sm" onClick={() => downloadText("nova-settings.json", exportSettings())}>
            <Icon name="download" size={14} /> Export
          </button>
        </SettingRow>
        <SettingRow title="Import settings">
          <button
            class="btn sm"
            onClick={async () => {
              const f = await pickFile("application/json,.json");
              if (!f) return;
              try {
                importSettings(await f.text());
                toast("Settings imported");
              } catch (e) {
                toast(`Import failed: ${(e as Error).message}`, { icon: "alert" });
              }
            }}
          >
            <Icon name="upload" size={14} /> Import
          </button>
        </SettingRow>
        <SettingRow title="Bookmarks" desc="Import and export bookmarks from the bookmark manager.">
          <button class="btn sm" onClick={() => openPage("bookmarks")}>
            Open bookmarks
          </button>
        </SettingRow>
      </Section>
      <Section title="Reset">
        <SettingRow title="Reset all settings" desc="Restores defaults. Bookmarks, history and notes are kept; clear those from the Privacy dashboard.">
          <button
            class="btn sm danger"
            onClick={async () => {
              if (await confirmAction("Reset settings?", "All appearance, layout, shortcut and proxy settings return to their defaults.", "Reset")) {
                resetSettings();
                toast("Settings reset");
              }
            }}
          >
            Reset settings
          </button>
        </SettingRow>
      </Section>
    </>
  );
}

export default function SettingsPage(_props: PageProps) {
  const [section, setSection] = useState(() => settingsSection.peek() ?? "appearance");
  // Jump to a section requested from elsewhere (e.g. "Add a Wisp server" on the error page).
  useEffect(() => {
    if (settingsSection.value) {
      setSection(settingsSection.value);
      settingsSection.value = null;
    }
  }, [settingsSection.value]);
  return (
    <div class="page settings-page">
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">
          <h1>Settings</h1>
          {NAV.map((n) => (
            <button key={n.id} class={`settings-nav-item${section === n.id ? " on" : ""}`} aria-current={section === n.id} onClick={() => setSection(n.id)}>
              <Icon name={n.icon} size={16} /> {n.label}
            </button>
          ))}
          <div class="menu-sep" />
          <button class="settings-nav-item" onClick={() => openPage("privacy")}>
            <Icon name="shieldCheck" size={16} /> Privacy dashboard
          </button>
        </nav>
        <div class="settings-body">
          {section === "appearance" && <Appearance />}
          {section === "home" && <HomeLayout />}
          {section === "performance" && <Performance />}
          {section === "proxy" && <ProxySettings />}
          {section === "search" && <SearchSettings />}
          {section === "ghost" && <GhostSettings />}
          {section === "presentation" && <Presentation />}
          {section === "shortcuts" && <ShortcutsSection />}
          {section === "games" && <GamesSettings />}
          {section === "data" && <DataSettings />}
        </div>
      </div>
    </div>
  );
}

function ShortcutsSection() {
  return <ShortcutList />;
}
