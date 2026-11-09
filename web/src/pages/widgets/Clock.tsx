import { useEffect, useState } from "preact/hooks";

function greeting(h: number) {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Updates once per minute, aligned to the minute boundary (no per-second timers). */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div class="w-clock">
      <div class="w-time">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      <div class="w-date">
        {greeting(now.getHours())} · {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </div>
    </div>
  );
}
