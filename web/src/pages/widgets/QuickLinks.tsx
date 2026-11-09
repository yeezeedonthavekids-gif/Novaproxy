import { useState } from "preact/hooks";
import { settings, updateSettings, type QuickLink } from "../../state/settings";
import { activeTab, navigate, newTab } from "../../state/tabs";
import { askForm, toast } from "../../components/ui";
import { BookmarkIcon } from "../../components/BookmarkBar";
import { Icon } from "../../components/Icon";
import { safeHttpUrl } from "../../lib/url";
import { uid } from "../../lib/storage";

async function editLink(link?: QuickLink) {
  const r = await askForm(link ? "Edit quick link" : "Add quick link", [
    { key: "label", label: "Name", value: link?.label ?? "" },
    { key: "url", label: "Address", value: link?.url ?? "", type: "url", placeholder: "example.com" },
  ]);
  if (!r) return;
  const raw = r.url!.trim();
  const url = safeHttpUrl(raw) ?? safeHttpUrl("https://" + raw);
  if (!url) return toast("Enter a valid web address", { icon: "alert" });
  updateSettings((s) => {
    const label = r.label!.trim() || new URL(url).hostname.replace(/^www\./, "");
    if (link) Object.assign(s.layout.quickLinks.find((q) => q.id === link.id)!, { label, url });
    else s.layout.quickLinks.push({ id: uid(), label, url });
  });
}

export function QuickLinks({ editing }: { editing: boolean }) {
  const links = settings.value.layout.quickLinks;
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div class="w-links">
      {links.map((l) => (
        <div
          key={l.id}
          class={`w-link${drag === l.id ? " dragging" : ""}`}
          draggable={editing}
          onDragStart={() => setDrag(l.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!drag || drag === l.id) return;
            updateSettings((s) => {
              const list = s.layout.quickLinks;
              const from = list.findIndex((x) => x.id === drag);
              const [m] = list.splice(from, 1);
              list.splice(list.findIndex((x) => x.id === l.id), 0, m!);
            });
            setDrag(null);
          }}
          onDragEnd={() => setDrag(null)}
        >
          <button
            class="w-link-main"
            title={l.url}
            onClick={(e) => (e.ctrlKey || e.metaKey ? newTab(l.url, { background: true }) : navigate(activeTab.peek().id, l.url))}
            onAuxClick={(e) => e.button === 1 && newTab(l.url, { background: true })}
          >
            <span class="w-link-icon">
              <BookmarkIcon title={l.label} url={l.url} />
            </span>
            <span class="w-link-label">{l.label}</span>
          </button>
          {editing && (
            <div class="w-link-tools">
              <button class="icon-btn sm" aria-label={`Edit ${l.label}`} onClick={() => void editLink(l)}>
                <Icon name="edit" size={13} />
              </button>
              <button class="icon-btn sm" aria-label={`Remove ${l.label}`} onClick={() => updateSettings((s) => (s.layout.quickLinks = s.layout.quickLinks.filter((x) => x.id !== l.id)))}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
        </div>
      ))}
      <button class="w-link w-link-add" onClick={() => void editLink()} aria-label="Add quick link">
        <span class="w-link-icon">
          <Icon name="plus" size={18} />
        </span>
        <span class="w-link-label">Add</span>
      </button>
    </div>
  );
}
