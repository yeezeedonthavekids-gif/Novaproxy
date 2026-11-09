import { useState } from "preact/hooks";
import { bookmarks, moveNode, removeNode, updateNode, addFolder, addBookmark, ROOT_BAR, type BookmarkNode } from "../state/bookmarks";
import { activeTab, navigate, newTab, tabs } from "../state/tabs";
import { Icon } from "./Icon";
import { Popover, askForm, toast } from "./ui";
import { hostOf, safeHttpUrl } from "../lib/url";

export function BookmarkIcon({ icon, title, url }: { icon?: string; title: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  if (icon && !failed && (icon.startsWith("data:image") || icon.startsWith("https://"))) {
    return (
      <span class="bm-icon">
        <img src={icon} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }
  if (icon && !icon.includes("/") && icon.length <= 8) return <span class="bm-icon emoji">{icon}</span>;
  const letter = (title || hostOf(url ?? "") || "?").trim().charAt(0).toUpperCase();
  return <span class="bm-icon letter">{letter}</span>;
}

export async function editBookmark(node: BookmarkNode) {
  if (node.type === "folder") {
    const r = await askForm("Rename folder", [{ key: "title", label: "Name", value: node.title }]);
    if (r) updateNode(node.id, { title: r.title!.trim() || node.title });
    return;
  }
  const r = await askForm("Edit bookmark", [
    { key: "title", label: "Name", value: node.title },
    { key: "url", label: "Address", value: node.url, type: "url" },
    { key: "icon", label: "Icon (emoji or image URL, optional)", value: node.icon?.startsWith("data:") ? "" : node.icon, placeholder: "e.g. 📚" },
  ]);
  if (!r) return;
  const url = safeHttpUrl(r.url!.trim()) ?? safeHttpUrl("https://" + r.url!.trim());
  if (!url) return toast("That address isn't a valid http(s) URL", { icon: "alert" });
  const icon = r.icon!.trim() ? r.icon!.trim() : node.icon?.startsWith("data:") ? node.icon : "";
  updateNode(node.id, { title: r.title!.trim() || url, url, icon });
}

export function openBookmark(node: BookmarkNode, inNewTab = false) {
  if (!node.url) return;
  if (inNewTab) newTab(node.url);
  else navigate(activeTab.peek().id, node.url);
}

function FolderMenu({ folderId, anchor, onClose }: { folderId: string; anchor: HTMLElement; onClose: () => void }) {
  const [stack, setStack] = useState<string[]>([folderId]);
  const nodes = bookmarks.value.nodes;
  const current = nodes[stack[stack.length - 1]!];
  if (!current) return null;
  return (
    <Popover anchor={anchor} onClose={onClose} align="start" width={280}>
      {stack.length > 1 && (
        <button class="menu-item" onClick={() => setStack(stack.slice(0, -1))}>
          <Icon name="back" /> {nodes[stack[stack.length - 2]!]?.title}
        </button>
      )}
      <div class="menu-label">{current.title}</div>
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {current.children?.length ? (
          current.children.map((cid) => {
            const n = nodes[cid];
            if (!n) return null;
            return n.type === "folder" ? (
              <button class="menu-item" key={cid} onClick={() => setStack([...stack, cid])}>
                <Icon name="folder" /> {n.title}
                <Icon name="chevronRight" size={14} class="ml-auto" />
              </button>
            ) : (
              <button
                class="menu-item"
                key={cid}
                title={n.url}
                onClick={(e) => {
                  openBookmark(n, e.ctrlKey || e.metaKey);
                  onClose();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    openBookmark(n, true);
                    onClose();
                  }
                }}
              >
                <BookmarkIcon icon={n.icon} title={n.title} url={n.url} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
              </button>
            );
          })
        ) : (
          <div class="hint" style={{ padding: "6px 10px" }}>
            This folder is empty
          </div>
        )}
      </div>
    </Popover>
  );
}

export function BookmarkBar() {
  const nodes = bookmarks.value.nodes;
  const items = nodes[ROOT_BAR]?.children ?? [];
  const [folder, setFolder] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [ctx, setCtx] = useState<{ node: BookmarkNode; anchor: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; into: boolean } | null>(null);

  const onDropItem = (e: DragEvent, target: BookmarkNode, index: number) => {
    e.preventDefault();
    const into = drop?.into && target.type === "folder";
    if (drag) {
      if (into) moveNode(drag, target.id);
      else moveNode(drag, ROOT_BAR, index);
    } else {
      // A tab (or link) dragged from elsewhere becomes a new bookmark.
      const url = safeHttpUrl(e.dataTransfer?.getData("text/plain") ?? "");
      if (url) {
        const tab = tabs.peek().find((t) => t.url === url);
        addBookmark(tab?.title ?? url, url, into ? target.id : ROOT_BAR, tab?.favicon.startsWith("data:") ? tab.favicon : "");
        if (!into) moveNode(bookmarks.peek().nodes[ROOT_BAR]!.children!.slice(-1)[0]!, ROOT_BAR, index);
      }
    }
    setDrag(null);
    setDrop(null);
  };

  return (
    <div
      class="bookbar"
      aria-label="Bookmarks bar"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (drag) moveNode(drag, ROOT_BAR);
        else {
          const url = safeHttpUrl(e.dataTransfer?.getData("text/plain") ?? "");
          if (url) {
            const tab = tabs.peek().find((t) => t.url === url);
            addBookmark(tab?.title ?? url, url, ROOT_BAR, tab?.favicon.startsWith("data:") ? tab.favicon : "");
          }
        }
        setDrag(null);
        setDrop(null);
      }}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        void askForm("New folder", [{ key: "title", label: "Name", value: "" }]).then((r) => r && addFolder(r.title!.trim()));
      }}
    >
      {items.length === 0 && <span class="bm-empty">Press ★ or drag a tab here to add bookmarks</span>}
      {items.map((id, index) => {
        const n = nodes[id];
        if (!n) return null;
        const cls = drop?.id === id ? (drop.into && n.type === "folder" ? " drop-into" : " drop-before") : "";
        return (
          <button
            key={id}
            class={`bm-item${cls}`}
            title={n.type === "link" ? `${n.title}\n${n.url}` : n.title}
            draggable
            onDragStart={(e) => {
              setDrag(id);
              e.dataTransfer!.effectAllowed = "move";
              if (n.url) e.dataTransfer!.setData("text/plain", n.url);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const into = n.type === "folder" && e.clientX > rect.left + rect.width * 0.25 && e.clientX < rect.right - rect.width * 0.25;
              if (drop?.id !== id || drop.into !== into) setDrop({ id, into });
            }}
            onDragLeave={() => setDrop(null)}
            onDrop={(e) => onDropItem(e, n, index)}
            onDragEnd={() => {
              setDrag(null);
              setDrop(null);
            }}
            onClick={(e) => {
              if (n.type === "folder") setFolder({ id, anchor: e.currentTarget as HTMLElement });
              else openBookmark(n, e.ctrlKey || e.metaKey);
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && n.type === "link") {
                e.preventDefault();
                openBookmark(n, true);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtx({ node: n, anchor: e.currentTarget as HTMLElement });
            }}
          >
            {n.type === "folder" ? <Icon name="folder" size={15} /> : <BookmarkIcon icon={n.icon} title={n.title} url={n.url} />}
            <span>{n.title}</span>
          </button>
        );
      })}
      {folder && <FolderMenu folderId={folder.id} anchor={folder.anchor} onClose={() => setFolder(null)} />}
      {ctx && (
        <Popover anchor={ctx.anchor} onClose={() => setCtx(null)} align="start">
          {ctx.node.type === "link" && (
            <>
              <button class="menu-item" onClick={() => (openBookmark(ctx.node, true), setCtx(null))}>
                <Icon name="plus" /> Open in new tab
              </button>
              <div class="menu-sep" />
            </>
          )}
          <button class="menu-item" onClick={() => (void editBookmark(ctx.node), setCtx(null))}>
            <Icon name="edit" /> {ctx.node.type === "folder" ? "Rename" : "Edit"}
          </button>
          <button class="menu-item" onClick={() => (void askForm("New folder", [{ key: "title", label: "Name", value: "" }]).then((r) => r && addFolder(r.title!.trim())), setCtx(null))}>
            <Icon name="folder" /> New folder
          </button>
          <button
            class="menu-item"
            onClick={() => {
              const node = ctx.node;
              removeNode(node.id);
              setCtx(null);
              toast(`Deleted "${node.title}"`, { icon: "trash" });
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        </Popover>
      )}
    </div>
  );
}
