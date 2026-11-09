import { signal } from "@preact/signals";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./Icon";

// ---- Toasts ---------------------------------------------------------------
interface ToastItem {
  id: number;
  text: string;
  icon: IconName;
  action?: { label: string; run: () => void };
}
const toasts = signal<ToastItem[]>([]);
let toastSeq = 0;

export function toast(text: string, opts: { icon?: IconName; action?: ToastItem["action"]; ms?: number } = {}) {
  const id = ++toastSeq;
  toasts.value = [...toasts.peek().slice(-2), { id, text, icon: opts.icon ?? "check", action: opts.action }];
  setTimeout(() => (toasts.value = toasts.peek().filter((t) => t.id !== id)), opts.ms ?? 3200);
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" key={t.id}>
          <Icon name={t.icon} size={16} />
          <span>{t.text}</span>
          {t.action && (
            <button
              class="btn sm"
              onClick={() => {
                t.action!.run();
                toasts.value = toasts.peek().filter((x) => x.id !== t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Modal ------------------------------------------------------------------
export function Modal({ onClose, children, width, label }: { onClose: () => void; children: ComponentChildren; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-skip-focus])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" ref={ref} role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ---- Prompt / confirm dialogs (promise based) ----------------------------
interface DialogField {
  key: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: "text" | "url" | "select";
  options?: { value: string; label: string }[];
}
interface DialogRequest {
  title: string;
  message?: string;
  fields?: DialogField[];
  confirm?: string;
  danger?: boolean;
  resolve: (v: Record<string, string> | null) => void;
}
const dialog = signal<DialogRequest | null>(null);

export function askForm(title: string, fields: DialogField[], opts: { message?: string; confirm?: string } = {}) {
  return new Promise<Record<string, string> | null>((resolve) => {
    dialog.value = { title, fields, resolve, ...opts };
  });
}

export function confirmAction(title: string, message: string, confirm = "Confirm", danger = true) {
  return new Promise<boolean>((resolve) => {
    dialog.value = { title, message, confirm, danger, resolve: (v) => resolve(v !== null) };
  });
}

export function DialogHost() {
  const req = dialog.value;
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (req) setValues(Object.fromEntries((req.fields ?? []).map((f) => [f.key, f.value ?? ""])));
  }, [req]);
  if (!req) return null;
  const close = (result: Record<string, string> | null) => {
    dialog.value = null;
    req.resolve(result);
  };
  return (
    <Modal onClose={() => close(null)} label={req.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close(values);
        }}
      >
        <h2>{req.title}</h2>
        {req.message && <p class="muted" style={{ margin: "6px 0 0" }}>{req.message}</p>}
        {req.fields?.map((f) => (
          <div class="field" key={f.key}>
            <label for={`dlg-${f.key}`}>{f.label}</label>
            {f.type === "select" ? (
              <select id={`dlg-${f.key}`} class="select" value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.currentTarget.value })}>
                {f.options?.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`dlg-${f.key}`}
                class="input"
                type={f.type === "url" ? "text" : "text"}
                inputMode={f.type === "url" ? "url" : undefined}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onInput={(e) => setValues({ ...values, [f.key]: e.currentTarget.value })}
              />
            )}
          </div>
        ))}
        <div class="actions">
          <button type="button" class="btn ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="submit" class={`btn ${req.danger ? "danger" : "primary"}`}>
            {req.confirm ?? "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Popover anchored to an element ---------------------------------------
export function Popover({
  anchor,
  onClose,
  children,
  align = "end",
  width,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ComponentChildren;
  align?: "start" | "end";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let left = align === "end" ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = a.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, a.top - h - 6);
    setPos({ top, left });
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onBlur = () => onClose(); // clicking into an iframe
    document.addEventListener("mousedown", onDown, true);
    addEventListener("keydown", onKey);
    addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      removeEventListener("keydown", onKey);
      removeEventListener("blur", onBlur);
    };
  }, [anchor]);
  return (
    <div
      class="popover"
      ref={ref}
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, ...(width ? { width } : {}) }}
    >
      {children}
    </div>
  );
}

// ---- Small form controls ----------------------------------------------------
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" class="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscales an image file to a small square PNG data URL (for icons/favicons). */
export async function imageToIcon(file: File, size = 64): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Section({ title, desc, children, actions }: { title: string; desc?: string; children: ComponentChildren; actions?: JSX.Element }) {
  return (
    <section class="section">
      <header class="section-head">
        <div>
          <h2>{title}</h2>
          {desc && <p class="hint">{desc}</p>}
        </div>
        {actions}
      </header>
      <div class="section-body">{children}</div>
    </section>
  );
}

export function SettingRow({ title, desc, children }: { title: string; desc?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="setting-row">
      <div class="setting-text">
        <div class="setting-title">{title}</div>
        {desc && <div class="hint">{desc}</div>}
      </div>
      <div class="setting-control">{children}</div>
    </div>
  );
}
