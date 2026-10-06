"use client";

import { useState } from "react";

export type BarRow = { label: string; value: number; display: string; detail?: string };

/** Horizontal single-hue bars, sorted by value, with direct value labels and a hover detail. */
export function BarList({ rows, unit }: { rows: BarRow[]; unit: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="text-sm text-ink-3">No data yet.</p>;
  return (
    <ul className="space-y-2" aria-label={unit}>
      {rows.map((r) => (
        <li
          key={r.label}
          className="relative"
          onPointerEnter={() => setHover(r.label)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-ink-2">{r.label}</span>
            <span className="font-semibold tabular-nums text-ink">{r.display}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-2">
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                background: "var(--accent)",
                opacity: hover && hover !== r.label ? 0.45 : 1,
              }}
            />
          </div>
          {hover === r.label && r.detail && (
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 shadow-md">
              {r.detail}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
