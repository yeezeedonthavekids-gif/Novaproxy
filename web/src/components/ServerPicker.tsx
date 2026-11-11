import { settings, updateSettings } from "../state/settings";
import { wispStatus, wispLabel, builtInWispUrl, checkWisp } from "../proxy/wisp";
import { normalizeWispUrl } from "../proxy/runtime-config";
import { Icon } from "./Icon";

/** Pick which Wisp server to use: "Default" (provided by this site) or any server you added. */
export function ServerPicker({ compact = false, onTest }: { compact?: boolean; onTest?: (url: string) => void }) {
  const p = settings.value.proxy;
  const st = wispStatus.value;
  const def = builtInWispUrl.value;
  const options = [{ id: "default", url: def }, ...p.wispServers.map((u) => ({ id: u, url: normalizeWispUrl(u) }))];
  const select = (id: string) => {
    updateSettings((d) => (d.proxy.wispSelected = id));
    void checkWisp();
  };

  return (
    <div class={`server-picker${compact ? " compact" : ""}`} role="radiogroup" aria-label="Wisp server">
      {options.map((o) => {
        const selected = p.wispSelected === o.id || (o.id === "default" && !options.some((x) => x.id === p.wispSelected));
        const inUse = st.url && st.url === o.url;
        return (
          <div key={o.id} class={`server-option${selected ? " selected" : ""}`}>
            <button class="server-main" role="radio" aria-checked={selected} onClick={() => select(o.id)}>
              <span class="server-radio" />
              <span class="server-name">
                {o.id === "default" ? "Default" : wispLabel(o.url)}
                {o.id === "default" && !compact && <span class="faint"> · provided by this site</span>}
              </span>
              {inUse && <span class={`dot ${st.state}`} title={st.state === "online" ? "In use" : st.state} />}
              {inUse && st.latency != null && <span class="badge ok">{st.latency} ms</span>}
            </button>
            {!compact && onTest && (
              <button class="btn sm" onClick={() => onTest(o.url)}>
                Test
              </button>
            )}
            {!compact && o.id !== "default" && (
              <button
                class="icon-btn sm"
                aria-label={`Remove ${wispLabel(o.url)}`}
                onClick={() =>
                  updateSettings((d) => {
                    d.proxy.wispServers = d.proxy.wispServers.filter((u) => u !== o.id);
                    if (d.proxy.wispSelected === o.id) d.proxy.wispSelected = "default";
                  })
                }
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
