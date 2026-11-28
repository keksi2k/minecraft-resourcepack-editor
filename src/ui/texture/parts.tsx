import { useEffect, useState } from 'react';
import { fromHex, toHex, type RGBA } from '../../render/pixelEdit';

export const sameColor = (a: RGBA, b: RGBA) => a.every((v, i) => v === b[i]);
export const css = (c: RGBA) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;

/** A collapsible group of the texture editor's side bar. */
export function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="border-t border-neutral-800 pt-2">
      <summary className="mb-2 cursor-pointer select-none text-neutral-400">{title}</summary>
      <div className="flex flex-col gap-2">{children}</div>
    </details>
  );
}

export function ColorChip({ color, className = 'h-5 w-5', title, onClick, active }: { color: RGBA; className?: string; title?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `${toHex(color)} · ${Math.round((color[3] / 255) * 100)}%`}
      className={`checker shrink-0 overflow-hidden rounded-sm ${className} ${active ? 'ring-2 ring-emerald-400' : 'ring-1 ring-neutral-700'}`}
    >
      <span className="block h-full w-full" style={{ background: css(color) }} />
    </button>
  );
}

export function Swatches({ label, colors, current, onPick }: { label?: string; colors: RGBA[]; current: RGBA; onPick: (c: RGBA) => void }) {
  if (!colors.length) return null;
  return (
    <div>
      {label && <div className="mb-1 text-neutral-400">{label}</div>}
      <div className="flex flex-wrap gap-0.5">
        {colors.map((c) => (
          <ColorChip key={c.join()} color={c} onClick={() => onPick(c)} active={sameColor(c, current)} />
        ))}
      </div>
    </div>
  );
}

/** A colour typed as hex: what's typed stays in the field until it's a whole colour. */
export function HexInput({ color, onChange, label }: { color: RGBA; onChange: (c: RGBA) => void; label: string }) {
  const hex = toHex(color);
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  return (
    <input
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = e.target.value.trim().replace(/^#?/, '#');
        if (/^#[0-9a-f]{6}$/i.test(v)) onChange(fromHex(v, color[3]));
      }}
      onBlur={() => setDraft(hex)}
      aria-label={label}
      spellCheck={false}
      className="w-full rounded bg-neutral-800 px-1 py-1 font-mono"
    />
  );
}
