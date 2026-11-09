import { useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import {
  bookmarks,
  addBookmark,
  addFolder,
  moveNode,
  removeNode,
  updateNode,
  searchBookmarks,
  exportHtml,
  exportJson,
  importBookmarks,
  parentOf,
  ROOT_BAR,
  ROOT_OTHER,
  ROOTS,
  type BookmarkNode,
} from "../state/bookmarks";
import { activeTab } from "../state/tabs";
import { safeHttpUrl, displayUrl, isInternal } from "../lib/url";
import { BookmarkIcon, editBookmark, openBookmark } from "../components/BookmarkBar";
import { Icon } from "../components/Icon";
import { askForm, confirmAction, downloadText, pickFile, imageToIcon, toast } from "../components/ui";
import "../styles/settings.css";
import "../styles/bookmarks.css";

function FolderTree({ id, depth, current, onSelect, onDropInto }: { id: string; depth: number; current: string; onSelect: (id: string) => void; onDropInto: (target: string) => void }) {
  const nodes = bookmarks.value.nodes;
  const n = nodes[id];
  const [over, setOver] = useState(false);
  if (!n || n.type !== "folder") return null;
  const subfolders = (n.children ?? []).filter((c) => nodes[c]?.type === "folder");
  return (
    <>
      <button
        class={`tree-item${current === id ? " on" : ""}${over ? " drop" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelect(id)}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDropInto(id);
        }}
      >
        <Icon name={id === ROOT_BAR ? "star" : "folder"} size={15} />
        <span>{n.title}</span>
        <span class="faint tree-count">{n.children?.length ?? 0}</span>
      </button>
      {subfolders.map((c) => (
        <FolderTree key={c} id={c} depth={depth + 1} current={current} onSelect={onSelect} onDropInto={onDropInto} />
      ))}
    </>
  );
}

export default function BookmarksPage(_props: PageProps) {
  const nodes = bookmarks.value.nodes;
  const [folder, setFolder] = useState(ROOT_BAR);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const current = nodes[folder] ?? nodes[ROOT_BAR]!;
  const items: BookmarkNode[] = query.trim() ? searchBookmarks(query) : (current.children ?? []).map((c) => nodes[c]!).filter(Boolean);

  const crumbs: BookmarkNode[] = [];
  for (let id: string | null = current.id; id; id = parentOf(id)) crumbs.unshift(nodes[id]!);

  const add = async () => {
    const tab = activeTab.peek();
    const r = await askForm("Add bookmark", [
      { key: "title", label: "Name", value: isInternal(tab.url) ? "" : tab.title },
      { key: "url", label: "Address", value: isInternal(tab.url) ? "" : tab.url, type: "url", placeholder: "example.com" },
    ]);
    if (!r) return;
    const url = safeHttpUrl(r.url!.trim()) ?? safeHttpUrl("https://" + r.url!.trim());
    if (!url) return toast("Enter a valid web address", { icon: "alert" });
    addBookmark(r.title!.trim() || url, url, current.id);
  };

  const setIcon = async (n: BookmarkNode) => {
    const f = await pickFile("image/*");
    if (!f) return;
    updateNode(n.id, { icon: await imageToIcon(f, 32) });
    toast("Icon updated");
  };

  return (
    <div class="page">
      <div class="page-wide">
        <div class="page-head">
          <div>
            <h1>Bookmarks</h1>
            <p>Drag to reorder or drop onto a folder. Everything stays on this device.</p>
          </div>
          <span class="spacer" />
          <button
            class="btn sm"
            onClick={async () => {
              const f = await pickFile(".html,.htm,.json,text/html,application/json");
              if (!f) return;
              try {
                const n = importBookmarks(await f.text());
                setFolder(ROOT_OTHER);
                toast(`Imported ${n} bookmarks into Other bookmarks`);
              } catch (e) {
                toast(`Import failed: ${(e as Error).message}`, { icon: "alert" });
              }
            }}
          >
            <Icon name="upload" size={14} /> Import
          </button>
          <button class="btn sm" onClick={() => downloadText("nova-bookmarks.html", exportHtml(), "text/html")}>
            <Icon name="download" size={14} /> Export HTML
          </button>
          <button class="btn sm" onClick={() => downloadText("nova-bookmarks.json", exportJson())}>
            <Icon name="download" size={14} /> Export JSON
          </button>
        </div>

        <div class="bm-layout">
          <aside class="bm-tree" aria-label="Folders">
            {ROOTS.map((r) => (
              <FolderTree
                key={r}
                id={r}
                depth={0}
                current={folder}
                onSelect={(id) => {
                  setFolder(id);
                  setQuery("");
                }}
                onDropInto={(target) => {
                  if (drag) moveNode(drag, target);
                  setDrag(null);
                }}
              />
            ))}
          </aside>
          <section class="bm-main">
            <div class="bm-toolbar">
              <label class="search-field" style={{ margin: 0, flex: 1 }}>
                <Icon name="search" size={16} />
                <input placeholder="Search all bookmarks" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search bookmarks" />
              </label>
              <button class="btn sm primary" onClick={() => void add()}>
                <Icon name="plus" size={14} /> Bookmark
              </button>
              <button class="btn sm" onClick={() => void askForm("New folder", [{ key: "title", label: "Name" }]).then((r) => r && addFolder(r.title!.trim(), current.id))}>
                <Icon name="folder" size={14} /> Folder
              </button>
            </div>
            {!query && (
              <div class="crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && <Icon name="chevronRight" size={13} />}
                    <button onClick={() => setFolder(c.id)}>{c.title}</button>
                  </span>
                ))}
              </div>
            )}
            <div class="section-body">
              {items.length === 0 && (
                <div class="empty">
                  <Icon name={query ? "search" : "bookmark"} size={28} />
                  <p>{query ? `No bookmarks match “${query}”.` : "This folder is empty."}</p>
                </div>
              )}
              {items.map((n, index) => (
                <div
                  key={n.id}
                  class={`list-row bm-row${drag === n.id ? " dragging" : ""}${dropAt === index ? " drop-line" : ""}`}
                  draggable={!query}
                  onDragStart={() => setDrag(n.id)}
                  onDragOver={(e) => {
                    if (!drag || query) return;
                    e.preventDefault();
                    setDropAt(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag && drag !== n.id) {
                      if (n.type === "folder" && e.shiftKey) moveNode(drag, n.id);
                      else moveNode(drag, current.id, index);
                    }
                    setDrag(null);
                    setDropAt(null);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setDropAt(null);
                  }}
                >
                  {!query && <Icon name="grip" size={15} class="faint" />}
                  {n.type === "folder" ? <Icon name="folder" size={16} /> : <BookmarkIcon icon={n.icon} title={n.title} url={n.url} />}
                  <button
                    class="list-row-label link-row"
                    onClick={(e) => (n.type === "folder" ? setFolder(n.id) : openBookmark(n, e.ctrlKey || e.metaKey))}
                    title={n.url ?? n.title}
                  >
                    {n.title}
                    {n.url && <span class="faint" style={{ marginLeft: 8, fontSize: 12 }}>{displayUrl(n.url)}</span>}
                    {n.type === "folder" && <span class="faint" style={{ marginLeft: 8, fontSize: 12 }}>{n.children?.length ?? 0} items</span>}
                  </button>
                  {n.type === "link" && (
                    <>
                      <button class="icon-btn sm" title="Open in new tab" aria-label={`Open ${n.title} in new tab`} onClick={() => openBookmark(n, true)}>
                        <Icon name="external" size={14} />
                      </button>
                      <button class="icon-btn sm" title="Custom icon" aria-label={`Set icon for ${n.title}`} onClick={() => void setIcon(n)}>
                        <Icon name="palette" size={14} />
                      </button>
                    </>
                  )}
                  <select
                    class="select bm-move"
                    aria-label={`Move ${n.title} to folder`}
                    value=""
                    onChange={(e) => {
                      const to = e.currentTarget.value;
                      if (to) moveNode(n.id, to);
                    }}
                  >
                    <option value="">Move to…</option>
                    {Object.values(nodes)
                      .filter((f) => f.type === "folder" && f.id !== n.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title}
                        </option>
                      ))}
                  </select>
                  <button class="icon-btn sm" aria-label={`Edit ${n.title}`} onClick={() => void editBookmark(n)}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    class="icon-btn sm"
                    aria-label={`Delete ${n.title}`}
                    onClick={async () => {
                      if (n.type === "folder" && n.children?.length && !(await confirmAction("Delete folder?", `“${n.title}” and the ${n.children.length} items inside it will be deleted.`, "Delete"))) return;
                      removeNode(n.id);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p class="hint" style={{ marginTop: 10 }}>Tip: hold Shift while dropping onto a folder row to move the item inside it.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
