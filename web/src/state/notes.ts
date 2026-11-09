import { signal, effect } from "@preact/signals";
import { load, save } from "../lib/storage";

export const notes = signal<string>(load<string>("notes", ""));
effect(() => save("notes", notes.value, 600));
