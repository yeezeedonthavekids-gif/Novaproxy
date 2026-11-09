import { useEffect, useState } from "preact/hooks";
import { settings } from "../../state/settings";
import { proxiedFetch } from "../../proxy/index";
import { openPage } from "../../lib/actions";

interface WeatherData {
  place: string;
  temp: number;
  code: number;
  unit: "c" | "f";
  at: number;
}

const CODES: [number[], string, string][] = [
  [[0], "Clear", "☀️"],
  [[1, 2], "Partly cloudy", "⛅"],
  [[3], "Overcast", "☁️"],
  [[45, 48], "Fog", "🌫️"],
  [[51, 53, 55, 56, 57], "Drizzle", "🌦️"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "🌧️"],
  [[71, 73, 75, 77, 85, 86], "Snow", "🌨️"],
  [[95, 96, 99], "Thunderstorm", "⛈️"],
];

const CACHE_KEY = "nova:weather-cache";

/**
 * Optional weather widget (off by default). Requests go through NOVA's own
 * proxy transport, so the weather service (Open-Meteo) never sees your IP.
 */
export function Weather() {
  const w = settings.value.weather;
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!w.city.trim()) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null") as (WeatherData & { city: string }) | null;
      if (cached && cached.city === w.city && cached.unit === w.unit && Date.now() - cached.at < 30 * 60_000) {
        setData(cached);
        return;
      }
    } catch {
      /* ignore */
    }
    let cancelled = false;
    (async () => {
      try {
        const geo = await (await proxiedFetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(w.city)}`)).json();
        const place = geo?.results?.[0];
        if (!place) throw new Error(`Couldn't find "${w.city}"`);
        const unit = w.unit === "f" ? "&temperature_unit=fahrenheit" : "";
        const fc = await (await proxiedFetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code${unit}`)).json();
        const result: WeatherData = { place: place.name, temp: Math.round(fc.current.temperature_2m), code: fc.current.weather_code, unit: w.unit, at: Date.now() };
        if (cancelled) return;
        setData(result);
        setError("");
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, city: w.city }));
      } catch (err) {
        if (!cancelled) setError(String((err as Error)?.message ?? err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [w.city, w.unit]);

  if (!w.city.trim()) {
    return (
      <p class="hint w-empty">
        Set a city in <button class="link-btn" onClick={() => openPage("settings")}>Settings → Home</button> to show the weather.
      </p>
    );
  }
  if (error) return <p class="error-text">{error}</p>;
  if (!data) return <div class="spinner" />;
  const [, label, emoji] = CODES.find(([codes]) => codes.includes(data.code)) ?? [[], "—", "🌡️"];
  return (
    <div class="w-weather">
      <span class="w-weather-emoji" aria-hidden="true">{emoji}</span>
      <div>
        <div class="w-weather-temp">
          {data.temp}°{data.unit.toUpperCase()}
        </div>
        <div class="hint">
          {label} · {data.place}
        </div>
      </div>
    </div>
  );
}
