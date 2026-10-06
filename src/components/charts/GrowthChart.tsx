"use client";

import { useMemo, useRef, useState } from "react";

type Point = { day: string; followers: number };

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

/** Single-series follower line with a crosshair + tooltip on hover. */
export function GrowthChart({ data, label = "Followers" }: { data: Point[]; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    const ys = data.map((d) => d.followers);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    const span = Math.max(max - min, 1);
    min -= span * 0.08;
    max += span * 0.08;
    const x = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
    const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) * (i + 0.5)) / 4);
    const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.followers).toFixed(1)}`).join("");
    const area = `${path}L${x(data.length - 1)},${H - PAD.bottom}L${x(0)},${H - PAD.bottom}Z`;
    return { x, y, ticks, path, area };
  }, [data]);

  if (data.length < 2) return <p className="text-sm text-ink-3">Not enough history yet — check back after a few syncs.</p>;

  const fmt = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };
  const h = hover != null ? data[hover] : null;
  const labelEvery = Math.ceil(data.length / 5);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`${label} over the last ${data.length} days, from ${fmt(data[0].followers)} to ${fmt(data.at(-1)!.followers)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={geo.y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-3)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.day} x={geo.x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-3)">
              {new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </text>
          ) : null,
        )}
        <path d={geo.area} fill="var(--accent)" opacity={0.08} />
        <path d={geo.path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {h && hover != null && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={geo.x(hover)} cy={geo.y(h.followers)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: `${(geo.x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? "-110%" : "10%"})` }}
        >
          <div className="text-ink-3">{new Date(h.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="font-semibold text-ink">
            {h.followers.toLocaleString("en")} {label.toLowerCase()}
          </div>
        </div>
      )}
    </div>
  );
}
