import { useState } from "preact/hooks";
import { tabs, activeId, activate, closeTab, newTab, moveTab, updateTab, closeOtherTabs, navigate, type Tab } from "../state/tabs";
import { privateMode } from "../state/session";
import { Icon, type IconName } from "./Icon";
import { Popover } from "./ui";
import { BASE } from "../proxy/runtime-config";
import { internalPage, isInternal } from "../lib/url";

const PAGE_ICONS: Record<string, IconName> = {
  home: "home",
  newtab: "plus",
  games: "gamepad",
  bookmarks: "bookmark",
  history: "clock",
  settings: "gear",
  privacy: "shieldCheck",
  diagnostics: "activity",
  downloads: "download",
  shortcuts: "keyboard",
};

export function TabFavicon({ tab }: { tab: Pick<Tab, "url" | "favicon" | "loading"> }) {
  const [broken, setBroken] = useState("");
  if (tab.loading) return <span class="spinner" />;
  if (isInternal(tab.url)) return <Icon name={PAGE_ICONS[internalPage(tab.url) ?? ""] ?? "globe"} size={14} />;
  if (tab.favicon && broken !== tab.favicon) {
    return <img src={tab.favicon} alt="" loading="lazy" decoding="async" onError={() => setBroken(tab.favicon)} />;
  }
  return <Icon name="globe" size={14} />;
}

export function TabStrip() {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ tab: Tab; anchor: HTMLElement } | null>(null);
  const list = tabs.value;
  const active = activeId.value;

  return (
    <div class="tabstrip">
      <div class="brand">
        <img src={BASE + "favicon.svg"} alt="" width={20} height={20} />
        <span>NOVA</span>
      </div>
      {privateMode.value && (
        <div class="private-badge" title="Private session: no history is saved and site data is cleared when you leave">
          <Icon name="eyeOff" size={13} /> Private
        </div>
      )}
      <div class="tabs" role="tablist" aria-label="Tabs">
        {list.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
            tabIndex={tab.id === active ? 0 : -1}
            class={`tab${tab.id === active ? " active" : ""}${tab.discarded ? " discarded" : ""}${tab.pinned ? " pinned" : ""}${dragId === tab.id ? " dragging" : ""}${overId === tab.id && dragId !== tab.id ? " drop-target" : ""}`}
            title={tab.discarded ? `${tab.title} (sleeping to save memory)` : tab.title}
            draggable
            onMouseDown={(e) => {
              if (e.button === 0) activate(tab.id);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") activate(tab.id);
              if (e.key === "Delete") closeTab(tab.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ tab, anchor: e.currentTarget as HTMLElement });
            }}
            onDragStart={(e) => {
              setDragId(tab.id);
              e.dataTransfer!.effectAllowed = "move";
              e.dataTransfer!.setData("text/plain", tab.url);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(tab.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) moveTab(dragId, tab.id);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
          >
            <span class="fav">
              <TabFavicon tab={tab} />
            </span>
            <span class="title">{tab.title}</span>
            <button
              class="close"
              aria-label={`Close ${tab.title}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
        <button class="icon-btn sm newtab-btn" aria-label="New tab" title="New tab" onClick={() => newTab()}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} align="start">
          <button class="menu-item" onClick={() => (newTab(menu.tab.url, { engine: menu.tab.engine }), setMenu(null))}>
            <Icon name="plus" /> Duplicate
          </button>
          <button class="menu-item" onClick={() => (updateTab(menu.tab.id, { pinned: !menu.tab.pinned }), setMenu(null))}>
            <Icon name="pin" /> {menu.tab.pinned ? "Unpin" : "Pin"} tab
          </button>
          {!isInternal(menu.tab.url) && (
            <button
              class="menu-item"
              onClick={() => {
                navigate(menu.tab.id, menu.tab.url, menu.tab.engine === "uv" ? "scramjet" : "uv");
                setMenu(null);
              }}
            >
              <Icon name="bolt" /> Reload with {menu.tab.engine === "uv" ? "Scramjet" : "Ultraviolet"}
            </button>
          )}
          {!isInternal(menu.tab.url) && !menu.tab.discarded && menu.tab.id !== active && (
            <button class="menu-item" onClick={() => (updateTab(menu.tab.id, { discarded: true, loading: false }), setMenu(null))}>
              <Icon name="moon" /> Put tab to sleep
            </button>
          )}
          <div class="menu-sep" />
          <button class="menu-item" onClick={() => (closeOtherTabs(menu.tab.id), setMenu(null))}>
            <Icon name="close" /> Close other tabs
          </button>
          <button class="menu-item" onClick={() => (closeTab(menu.tab.id), setMenu(null))}>
            <Icon name="close" /> Close tab
          </button>
        </Popover>
      )}
    </div>
  );
}
