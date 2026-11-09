import { useEffect, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import { settings, updateSettings } from "../state/settings";
import { privateMode } from "../state/session";
import { tabs, activate, closeTab } from "../state/tabs";
import { history, clearHistory } from "../state/history";
import { allLinks } from "../state/bookmarks";
import { gamePrefs } from "../state/games";
import { notes } from "../state/notes";
import { wispStatus, checkWisp } from "../proxy/wisp";
import { ENGINES, engineState, transportState } from "../proxy/index";
import { clearProxiedSiteData, storageEstimate, formatBytes } from "../lib/sitedata";
import { PREFIX, remove } from "../lib/storage";
import { mediaStore } from "../lib/idb";
import { isInternal, displayUrl } from "../lib/url";
import { Icon, type IconName } from "../components/Icon";
import { Section, SettingRow, Switch, confirmAction, toast } from "../components/ui";
import "../styles/settings.css";
import "../styles/privacy.css";

function Fact({ icon, tone, title, children }: { icon: IconName; tone: "ok" | "warn" | "info"; title: string; children: preact.ComponentChildren }) {
  return (
    <div class={`fact ${tone}`}>
      <span class="fact-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div class="fact-title">{title}</div>
        <div class="hint">{children}</div>
      </div>
    </div>
  );
}

export default function PrivacyPage(_props: PageProps) {
  const s = settings.value;
  const st = wispStatus.value;
  const eng = engineState.value;
  const tr = transportState.value;
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [siteKeys, setSiteKeys] = useState(0);
  const refresh = () => {
    void storageEstimate().then(setUsage);
    try {
      setSiteKeys(Object.keys(localStorage).filter((k) => !k.startsWith(PREFIX)).length);
    } catch {
      setSiteKeys(0);
    }
  };
  useEffect(refresh, []);

  const host = (() => {
    try {
      return new URL(st.url || st.candidates[0] || location.href).host;
    } catch {
      return "—";
    }
  })();
  const webTabs = tabs.value.filter((t) => !isInternal(t.url));

  return (
    <div class="page">
      <div class="page-narrow">
        <div class="page-head">
          <div>
            <h1>Privacy</h1>
            <p>What NOVA protects, what it can't, and the data stored on this device.</p>
          </div>
        </div>

        <div class="privacy-hero card">
          <div class="privacy-status">
            <span class={`privacy-orb ${st.state}`}>
              <Icon name={st.state === "online" ? "shieldCheck" : st.state === "offline" ? "wifiOff" : "shield"} size={26} />
            </span>
            <div>
              <div class="privacy-title">{st.state === "online" ? "Relay connected" : st.state === "offline" ? "Relay unreachable" : st.state === "checking" ? "Checking relay…" : "Relay not used yet"}</div>
              <div class="hint">
                Wisp server <span class="mono">{host}</span>
                {st.latency != null && ` · ${st.latency} ms handshake`}
                {st.state === "offline" && ` · ${st.error}`}
              </div>
            </div>
            <span class="spacer" />
            <button class="btn sm" onClick={() => void checkWisp()}>
              <Icon name="reload" size={14} /> Check
            </button>
          </div>
          <div class="privacy-stats">
            <div>
              <span class="faint">Default engine</span>
              <strong>{ENGINES[s.proxy.engine].name}</strong>
              <span class="hint">{eng[s.proxy.engine].state === "ready" ? "Running" : eng[s.proxy.engine].state === "error" ? eng[s.proxy.engine].error : "Starts on first use"}</span>
            </div>
            <div>
              <span class="faint">Transport</span>
              <strong>{s.proxy.transport === "epoxy" ? "Epoxy TLS" : "libcurl.js"}</strong>
              <span class="hint">{tr.state === "ready" ? "Encrypting in browser" : tr.state === "error" ? tr.error : "Starts on first use"}</span>
            </div>
            <div>
              <span class="faint">Session</span>
              <strong>{privateMode.value ? "Private" : "Standard"}</strong>
              <span class="hint">{webTabs.length} proxied tab{webTabs.length === 1 ? "" : "s"} open</span>
            </div>
          </div>
        </div>

        <Section title="What is protected">
          <div class="facts">
            <Fact icon="lock" tone="ok" title="HTTPS stays encrypted end-to-end">
              The TLS connection to each website is made inside your browser (in WebAssembly). The Wisp server relays encrypted bytes and cannot read pages, passwords or cookies on HTTPS sites.
            </Fact>
            <Fact icon="eyeOff" tone="ok" title="Websites see the relay, not you">
              Sites receive the Wisp server's IP address instead of yours, and your network sees a connection to NOVA instead of the sites you visit.
            </Fact>
            <Fact icon="shieldCheck" tone="ok" title="No tracking, no accounts">
              NOVA has no analytics or telemetry. History, bookmarks and settings live only in this browser. The NOVA server doesn't log the sites you visit by default.
            </Fact>
          </div>
        </Section>

        <Section title="What is not protected">
          <div class="facts">
            <Fact icon="alert" tone="warn" title="This is not anonymity">
              The Wisp server operator can see which hostnames you connect to and when. Sites can still identify you if you sign in or through browser fingerprinting. Use a trusted server.
            </Fact>
            <Fact icon="unlock" tone="warn" title="Plain HTTP sites are visible to the relay">
              Pages without HTTPS (marked with an open lock in the address bar) travel unencrypted between the relay and the site.
            </Fact>
            <Fact icon="info" tone="info" title="Proxied sites share NOVA's storage space">
              Websites run under NOVA's address, so their cookies and storage sit next to NOVA's data in this browser. Clear them below any time. Game files load directly from the game project's CDN, which can see your IP.
            </Fact>
          </div>
        </Section>

        <Section title="Session">
          <SettingRow title="Private session" desc="No history is recorded, tabs aren't saved, and website data is wiped when the session ends or NOVA is closed.">
            <Switch label="Private session" checked={privateMode.value} onChange={(v) => (privateMode.value = v)} />
          </SettingRow>
          <SettingRow title="Always start in a private session">
            <Switch label="Always start private" checked={s.privacy.startPrivate} onChange={(v) => updateSettings((d) => (d.privacy.startPrivate = v))} />
          </SettingRow>
          <SettingRow title="Restore tabs on startup">
            <Switch label="Restore tabs" checked={s.privacy.restoreTabs} onChange={(v) => updateSettings((d) => (d.privacy.restoreTabs = v))} />
          </SettingRow>
          {webTabs.length > 0 && (
            <div class="session-list">
              {webTabs.map((t) => (
                <div class="list-row" key={t.id}>
                  <Icon name={t.discarded ? "moon" : "globe"} size={15} />
                  <button class="list-row-label link-row" onClick={() => activate(t.id)} title="Switch to tab">
                    {t.title} <span class="faint">{displayUrl(t.url)}</span>
                  </button>
                  <span class="badge">{t.engine === "uv" ? "UV" : "Scramjet"}</span>
                  <button class="icon-btn sm" aria-label={`Close ${t.title}`} onClick={() => closeTab(t.id)}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="History">
          <SettingRow title="Save browsing history" desc={`${history.value.length} entries, stored only in this browser.`}>
            <Switch label="Save history" checked={s.privacy.saveHistory} onChange={(v) => updateSettings((d) => (d.privacy.saveHistory = v))} />
          </SettingRow>
          <SettingRow title="Keep history for">
            <select class="select" style={{ width: 150 }} value={String(s.privacy.historyDays)} onChange={(e) => updateSettings((d) => (d.privacy.historyDays = Number(e.currentTarget.value)))}>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="0">Forever</option>
            </select>
          </SettingRow>
          <SettingRow title="Clear history">
            <button
              class="btn sm danger"
              disabled={!history.value.length}
              onClick={async () => {
                if (await confirmAction("Clear history?", "All browsing history stored by NOVA on this device will be deleted.", "Clear history")) {
                  clearHistory();
                  toast("History cleared", { icon: "trash" });
                }
              }}
            >
              Clear history
            </button>
          </SettingRow>
        </Section>

        <Section title="Cookies & site data" desc="Cookies and storage saved by websites you visited through NOVA. Each engine keeps cookies in its own internal format, so they're managed together.">
          <SettingRow title="Website data on this device" desc={`${siteKeys} storage entr${siteKeys === 1 ? "y" : "ies"} from websites${usage ? ` · NOVA uses ${formatBytes(usage.usage)} in total` : ""}`}>
            <button
              class="btn sm danger"
              onClick={async () => {
                if (!(await confirmAction("Clear cookies and site data?", "You'll be signed out of websites you used through NOVA. NOVA's own settings, bookmarks and history are kept.", "Clear site data"))) return;
                const r = await clearProxiedSiteData();
                refresh();
                toast(`Cleared ${r.databases} databases, ${r.storageKeys} storage entries, ${r.caches} caches`, { icon: "trash" });
              }}
            >
              Clear cookies & site data
            </button>
          </SettingRow>
          <SettingRow title="Clear site data when NOVA closes">
            <Switch label="Clear site data on exit" checked={s.privacy.clearSiteDataOnExit} onChange={(v) => updateSettings((d) => (d.privacy.clearSiteDataOnExit = v))} />
          </SettingRow>
        </Section>

        <Section title="NOVA's local data">
          <SettingRow title="Stored on this device" desc={`${allLinks.value.length} bookmarks · ${history.value.length} history entries · ${gamePrefs.value.favorites.length} favorite games · ${notes.value.length} characters of notes`}>
            <button
              class="btn sm danger"
              onClick={async () => {
                if (!(await confirmAction("Erase everything?", "Deletes all NOVA data in this browser: settings, bookmarks, history, notes, game preferences, wallpaper and website data. This can't be undone.", "Erase all data"))) return;
                await clearProxiedSiteData();
                for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) remove(k.slice(PREFIX.length));
                await mediaStore.delete("wallpaper").catch(() => {});
                const regs = await navigator.serviceWorker?.getRegistrations?.();
                await Promise.all((regs ?? []).map((r) => r.unregister()));
                location.reload();
              }}
            >
              Erase all NOVA data
            </button>
          </SettingRow>
        </Section>
      </div>
    </div>
  );
}
