import { useEffect, useState } from "preact/hooks";
import { settings } from "../state/settings";
import { Appearance } from "./Appearance";
import { TabStrip } from "./TabStrip";
import { Toolbar } from "./Toolbar";
import { BookmarkBar } from "./BookmarkBar";
import { Content } from "./Content";
import { Ghost } from "./Ghost";
import { Toasts, DialogHost } from "./ui";

export function App() {
  const s = settings.value;
  const minimal = s.presentation.minimal;
  const [reveal, setReveal] = useState(false);

  // In minimal mode, reveal the toolbar when the pointer touches the top edge.
  useEffect(() => {
    if (!minimal) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 4) setReveal(true);
      else if (e.clientY > 140) setReveal(false);
    };
    addEventListener("mousemove", onMove, { passive: true });
    return () => removeEventListener("mousemove", onMove);
  }, [minimal]);

  return (
    <>
      <Appearance />
      <div class={`shell${minimal ? " minimal" : ""}`}>
        <header class={`chrome-top${reveal ? " reveal" : ""}`}>
          <TabStrip />
          <Toolbar />
          {s.layout.showBookmarkBar && <BookmarkBar />}
        </header>
        <Content />
      </div>
      <Ghost />
      <DialogHost />
      <Toasts />
    </>
  );
}
