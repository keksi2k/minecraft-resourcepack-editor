import { create } from 'zustand';
import { t } from '../i18n';
import type { Tab } from './appStore';

/** A texture or sound opened in its editor. */
export interface EditTarget {
  kind: 'texture' | 'sound';
  path: string;
  /** Current bytes (vanilla sounds may need a network fetch). */
  load: () => Promise<Uint8Array | undefined>;
  /** Saves somewhere other than `path` (e.g. adds a new sound variant); `path` is then just a label. */
  onSave?: (bytes: Uint8Array) => void;
}

interface EditorState {
  target?: EditTarget;
  /** The tab the editor was opened in; it replaces that tab's main area, side panels stay. */
  tab?: Tab;
  /** The open editor has unsaved changes. */
  dirty: boolean;
  open(target: EditTarget, tab: Tab): void;
  close(): void;
  /** Asks before unsaved changes would be lost; true when it's fine to go on. */
  confirmLeave(): boolean;
}

export const useEditor = create<EditorState>((set, get) => ({
  dirty: false,
  open(target, tab) {
    if (get().target?.path === target.path) return;
    if (!get().confirmLeave()) return;
    set({ target, tab, dirty: false });
  },
  close: () => set({ target: undefined, tab: undefined, dirty: false }),
  confirmLeave: () => !get().target || !get().dirty || confirm(t('editor.unsaved')),
}));

/** Whether the editor is open in `tab`. */
export const useEditing = (tab: Tab) => useEditor((s) => !!s.target && s.tab === tab);
