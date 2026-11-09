import type { PageProps } from "../components/Content";
import { downloads, clearDownloads } from "../state/downloads";
import { formatBytes } from "../lib/sitedata";
import { Icon } from "../components/Icon";
import "../styles/settings.css";

export default function DownloadsPage(_props: PageProps) {
  const list = downloads.value;
  return (
    <div class="page">
      <div class="page-narrow">
        <div class="page-head">
          <div>
            <h1>Downloads</h1>
            <p>Files downloaded in this session. With Scramjet, NOVA tracks downloads here; with Ultraviolet, your browser's own download manager handles them.</p>
          </div>
          <span class="spacer" />
          <button class="btn sm" disabled={!list.length} onClick={clearDownloads}>
            Clear list
          </button>
        </div>
        {list.length === 0 ? (
          <div class="empty">
            <Icon name="download" size={28} />
            <p>No downloads in this session.</p>
          </div>
        ) : (
          <div class="section-body">
            {list.map((d) => (
              <div class="list-row" key={d.id}>
                <Icon name={d.status === "failed" ? "alert" : d.status === "done" ? "check" : "download"} size={16} />
                <span class="list-row-label">
                  <strong>{d.filename}</strong>
                  <div class="hint">
                    {d.status === "downloading"
                      ? `${formatBytes(d.received)}${d.size ? ` of ${formatBytes(d.size)}` : ""}`
                      : d.status === "done"
                        ? `${formatBytes(d.size)} · ${new URL(d.url).hostname}`
                        : "Download failed"}
                  </div>
                  {d.status === "downloading" && d.size > 0 && (
                    <div class="progress">
                      <span style={{ width: `${Math.min(100, (d.received / d.size) * 100)}%` }} />
                    </div>
                  )}
                </span>
                {d.status === "done" && (
                  <a class="btn sm" href={d.objectUrl} download={d.filename}>
                    Save again
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
