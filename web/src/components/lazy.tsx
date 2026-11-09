import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { markLoaded } from "../proxy/modules";

/**
 * Minimal lazy loader (avoids pulling in preact/compat). The module is only
 * downloaded the first time the page is opened, then cached.
 */
export function lazyPage<P extends object>(name: string, loader: () => Promise<{ default: ComponentType<P> }>) {
  let Loaded: ComponentType<P> | null = null;
  let promise: Promise<void> | null = null;
  const load = () =>
    (promise ??= loader().then((m) => {
      Loaded = m.default;
      markLoaded(name);
    }));

  function LazyPage(props: P) {
    const [, setReady] = useState(!!Loaded);
    const [error, setError] = useState<string>("");
    useEffect(() => {
      if (Loaded) return;
      load().then(
        () => setReady(true),
        (err) => {
          promise = null;
          setError(String(err?.message ?? err));
        },
      );
    }, []);
    if (Loaded) return <Loaded {...props} />;
    if (error) {
      return (
        <div class="page-loading">
          <div style={{ textAlign: "center" }}>
            <p class="error-text">Couldn't load {name}: {error}</p>
            <button class="btn" onClick={() => location.reload()}>
              Reload NOVA
            </button>
          </div>
        </div>
      );
    }
    return (
      <div class="page-loading" aria-busy="true">
        <span class="spinner" />
      </div>
    );
  }
  LazyPage.preload = load;
  return LazyPage;
}
