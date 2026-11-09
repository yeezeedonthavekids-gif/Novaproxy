import { useState } from "preact/hooks";
import { settings, searchTemplate, SEARCH_ENGINES } from "../../state/settings";
import { activeTab, navigate } from "../../state/tabs";
import { resolveInput } from "../../lib/url";
import { prepareEngine } from "../../proxy/index";
import { Icon } from "../../components/Icon";

export function SearchBox({ autofocus = false }: { autofocus?: boolean }) {
  const [q, setQ] = useState("");
  const s = settings.value.search;
  const name = SEARCH_ENGINES.find((e) => e.id === s.engine)?.name ?? s.custom.find((c) => c.id === s.engine)?.name ?? "the web";
  return (
    <form
      class="w-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(activeTab.peek().id, resolveInput(q, searchTemplate.peek()));
      }}
    >
      <Icon name="search" size={18} />
      <input
        aria-label="Search or enter address"
        placeholder={`Search ${name} or type an address`}
        value={q}
        autofocus={autofocus}
        spellcheck={false}
        autocomplete="off"
        onFocus={() => {
          if (settings.peek().performance.mode !== "efficiency") void prepareEngine(activeTab.peek().engine).catch(() => {});
        }}
        onInput={(e) => setQ(e.currentTarget.value)}
      />
      <button class="btn primary" type="submit" disabled={!q.trim()}>
        Go
      </button>
    </form>
  );
}
