import { navigate, sendCommand, type Tab } from "../state/tabs";
import { ENGINES } from "../proxy/index";
import { wispStatus, checkWisp } from "../proxy/wisp";
import { openPage, openSettings } from "../lib/actions";
import { displayUrl } from "../lib/url";
import { Icon } from "./Icon";

/** NOVA's own error page for problems NOVA can detect before a site is even contacted. */
export function ErrorPage({ tab }: { tab: Tab }) {
  const err = tab.error!;
  const other = tab.engine === "uv" ? "scramjet" : "uv";
  const st = wispStatus.value;
  const isWisp = err.kind === "wisp";
  if (isWisp && st.notConfigured) {
    return (
      <div class="error-page">
        <div class="error-card">
          <div class="error-icon wisp">
            <Icon name="cloud" size={26} />
          </div>
          <h1>No Wisp server is set up for this site</h1>
          <p class="muted">
            NOVA relays websites through a Wisp server, but this deployment doesn't have one. Static hosts such as Netlify, Vercel, Cloudflare Pages and GitHub Pages can only serve
            files, so the server must run somewhere else (Docker, Render, a VPS).
          </p>
          <ol class="setup-steps">
            <li>Deploy the NOVA server, for example with Render (one click with the included <code>render.yaml</code>).</li>
            <li>
              Add its address, like <code>wss://your-app.onrender.com/wisp/</code>, in Settings. Site owners can instead set <code>VITE_WISP_URL</code> or edit{" "}
              <code>nova.config.json</code> so it works for every visitor.
            </li>
          </ol>
          <div class="row" style={{ justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <button class="btn primary" onClick={() => openSettings("proxy")}>
              <Icon name="plus" size={15} /> Add a Wisp server
            </button>
            <button class="btn" onClick={() => void checkWisp().then(() => sendCommand(tab.id, "reload"))}>
              <Icon name="reload" size={15} /> Check again
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="error-page">
      <div class="error-card">
        <div class={`error-icon${isWisp ? " wisp" : ""}`}>
          <Icon name={isWisp ? "wifiOff" : "alert"} size={26} />
        </div>
        <h1>{err.message}</h1>
        <p class="muted">
          {isWisp ? (
            <>
              Couldn't open <strong>{displayUrl(tab.url)}</strong> because the Wisp server that relays NOVA's traffic is not responding.
              {st.nextRetryAt ? " NOVA keeps retrying in the background and reloads this page as soon as the server is back." : ""}
            </>
          ) : (
            <>
              <strong>{ENGINES[tab.engine].name}</strong> couldn't load <strong>{displayUrl(tab.url)}</strong>.
            </>
          )}
        </p>
        {(err.detail || (isWisp && st.error)) && <pre class="error-detail">{err.detail || st.error}</pre>}
        <div class="row" style={{ justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
          <button
            class="btn primary"
            onClick={() => {
              if (isWisp) void checkWisp().then(() => sendCommand(tab.id, "reload"));
              else sendCommand(tab.id, "reload");
            }}
          >
            <Icon name="reload" size={15} /> Try again
          </button>
          {!isWisp && (
            <button class="btn" onClick={() => navigate(tab.id, tab.url, other)}>
              <Icon name="bolt" size={15} /> Use {ENGINES[other].name}
            </button>
          )}
          <button class="btn ghost" onClick={() => openPage("diagnostics")}>
            <Icon name="activity" size={15} /> Diagnostics
          </button>
          {isWisp && (
            <button class="btn ghost" onClick={() => openSettings("proxy")}>
              <Icon name="gear" size={15} /> Change server
            </button>
          )}
        </div>
        {isWisp && (
          <p class="hint" style={{ marginTop: 18 }}>
            If you host NOVA yourself, make sure the NOVA server is running and that the Wisp address in Settings → Proxy points to it.
          </p>
        )}
      </div>
    </div>
  );
}
