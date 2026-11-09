import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { settings, updateSettings, type WidgetId, type WidgetSize } from "../state/settings";
import { privateMode } from "../state/session";
import { wispStatus } from "../proxy/wisp";
import { openPage } from "../lib/actions";
import { Icon, type IconName } from "../components/Icon";
import type { PageProps } from "../components/Content";
import { lazyPage } from "../components/lazy";
import { Clock } from "./widgets/Clock";
import { SearchBox } from "./widgets/SearchBox";
import { QuickLinks } from "./widgets/QuickLinks";
import { Recent, GamesWidget, Notes, BookmarksWidget } from "./widgets/Misc";
import "../styles/home.css";

const Weather = lazyPage<object>("Weather widget", () => import("./widgets/Weather").then((m) => ({ default: m.Weather })));

const META: Record<WidgetId, { title: string; icon: IconName }> = {
  clock: { title: "Clock", icon: "clock" },
  search: { title: "Search", icon: "search" },
  quicklinks: { title: "Quick links", icon: "link" },
  recent: { title: "Recently visited", icon: "clock" },
  games: { title: "Continue playing", icon: "gamepad" },
  notes: { title: "Notes", icon: "note" },
  bookmarks: { title: "Bookmarks", icon: "bookmark" },
  weather: { title: "Weather", icon: "cloud" },
};

const SIZES: WidgetSize[] = ["s", "m", "l"];

function WidgetFrame({ id, size, editing, children, bare }: { id: WidgetId; size: WidgetSize; editing: boolean; children: ComponentChildren; bare?: boolean }) {
  const [over, setOver] = useState(false);
  const meta = META[id];
  return (
    <section
      class={`widget size-${size}${bare && !editing ? " bare" : ""}${over ? " drop" : ""}${editing ? " editing" : ""}`}
      draggable={editing}
      onDragStart={(e) => e.dataTransfer!.setData("nova/widget", id)}
      onDragOver={(e) => {
        if (!editing) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer?.getData("nova/widget") as WidgetId;
        if (!from || from === id) return;
        updateSettings((s) => {
          const list = s.layout.widgets;
          const i = list.findIndex((w) => w.id === from);
          const [moved] = list.splice(i, 1);
          list.splice(list.findIndex((w) => w.id === id), 0, moved!);
        });
      }}
      aria-label={meta.title}
    >
      {(!bare || editing) && (
        <header class="widget-head">
          {editing && <Icon name="grip" size={15} class="grip" />}
          <Icon name={meta.icon} size={14} />
          <span>{meta.title}</span>
          {editing && (
            <div class="widget-tools">
              <button
                class="btn sm ghost"
                title="Change size"
                onClick={() => updateSettings((s) => {
                  const w = s.layout.widgets.find((x) => x.id === id)!;
                  w.size = SIZES[(SIZES.indexOf(w.size) + 1) % SIZES.length]!;
                })}
              >
                {size.toUpperCase()}
              </button>
              <button class="icon-btn sm" aria-label={`Hide ${meta.title}`} onClick={() => updateSettings((s) => (s.layout.widgets.find((x) => x.id === id)!.enabled = false))}>
                <Icon name="eyeOff" size={14} />
              </button>
            </div>
          )}
        </header>
      )}
      <div class="widget-body">{children}</div>
    </section>
  );
}

function renderWidget(id: WidgetId, editing: boolean) {
  switch (id) {
    case "clock":
      return <Clock />;
    case "search":
      return <SearchBox />;
    case "quicklinks":
      return <QuickLinks editing={editing} />;
    case "recent":
      return <Recent />;
    case "games":
      return <GamesWidget />;
    case "notes":
      return <Notes />;
    case "bookmarks":
      return <BookmarksWidget />;
    case "weather":
      return <Weather />;
  }
}

export default function Home({ clean }: PageProps & { clean?: boolean }) {
  const s = settings.value;
  const [editing, setEditing] = useState(false);
  const layout = clean ? "clean" : s.layout.home;
  const widgets = s.layout.widgets.filter((w) => w.enabled);
  const hidden = s.layout.widgets.filter((w) => !w.enabled);
  const st = wispStatus.value;

  if (layout === "clean" || layout === "minimal") {
    return (
      <div class={`home home-${layout}`}>
        <div class="home-hero">
          {layout === "minimal" && <Clock />}
          <SearchBox autofocus={layout === "clean"} />
        </div>
      </div>
    );
  }

  const heroIds: WidgetId[] = layout === "centered" ? ["clock", "search"] : [];
  const hero = widgets.filter((w) => heroIds.includes(w.id));
  const rest = widgets.filter((w) => !heroIds.includes(w.id));

  return (
    <div class={`home home-${layout}`}>
      <div class="home-inner">
        {hero.length > 0 && (
          <div class="home-hero">
            {hero.map((w) => (
              <div key={w.id}>{renderWidget(w.id, editing)}</div>
            ))}
          </div>
        )}
        <div class="widget-grid">
          {rest.map((w) => (
            <WidgetFrame key={w.id} id={w.id} size={w.size} editing={editing} bare={w.id === "clock" || w.id === "search" || (layout === "centered" && w.id === "quicklinks")}>
              {renderWidget(w.id, editing)}
            </WidgetFrame>
          ))}
        </div>
        {editing && hidden.length > 0 && (
          <div class="home-hidden">
            <span class="hint">Hidden widgets:</span>
            {hidden.map((w) => (
              <button key={w.id} class="chip" onClick={() => updateSettings((d) => (d.layout.widgets.find((x) => x.id === w.id)!.enabled = true))}>
                <Icon name="plus" size={13} /> {META[w.id].title}
              </button>
            ))}
          </div>
        )}
        <footer class="home-footer">
          <button class="chip" onClick={() => openPage("privacy")} title="Privacy dashboard">
            <span class={`dot ${st.state}`} />
            {st.state === "online" ? "Relay connected" : st.state === "offline" ? "Relay offline" : "Relay standby"}
            {privateMode.value && " · Private session"}
          </button>
          <span class="spacer" />
          <button class={`chip${editing ? " on" : ""}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
            <Icon name={editing ? "check" : "layout"} size={13} /> {editing ? "Done" : "Edit layout"}
          </button>
          <button class="chip" onClick={() => openPage("settings")}>
            <Icon name="palette" size={13} /> Customize
          </button>
        </footer>
      </div>
    </div>
  );
}
