"use client";

import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // display Monday first; data is indexed 0 = Sunday
const STEPS = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

/** Weekday x hour grid on a single-hue sequential ramp. values[weekday][hour] in 0..1. */
export function Heatmap({ values, best }: { values: number[][]; best: { weekday: number; hour: number }[] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const isBest = (d: number, h: number) => best.some((b) => b.weekday === d && b.hour === h);
  const step = (v: number) => STEPS[Math.min(STEPS.length - 1, Math.round(v * (STEPS.length - 1)))];

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: `36px repeat(24, minmax(0, 1fr))` }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10px] text-ink-3">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {ORDER.map((d, row) => (
            <div key={d} className="contents">
              <div className="pr-1 text-right text-[11px] leading-5 text-ink-3">{DAYS[row]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = values[d]?.[h] ?? 0;
                return (
                  <div
                    key={h}
                    onPointerEnter={() => setHover({ d, h })}
                    onPointerLeave={() => setHover(null)}
                    className="relative h-5 rounded-[3px]"
                    style={{
                      background: step(v),
                      outline: isBest(d, h) ? "2px solid var(--text)" : undefined,
                      outlineOffset: -2,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span>
          {hover
            ? `${DAYS[ORDER.indexOf(hover.d)]} ${String(hover.h).padStart(2, "0")}:00 · ${Math.round((values[hover.d]?.[hover.h] ?? 0) * 100)}% of peak activity${isBest(hover.d, hover.h) ? " · recommended slot" : ""}`
            : "Hover a cell for details. Outlined cells are your recommended slots."}
        </span>
        <span className="flex items-center gap-1">
          Quiet
          {STEPS.map((s) => (
            <span key={s} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: s }} />
          ))}
          Busy
        </span>
      </div>
    </div>
  );
}
