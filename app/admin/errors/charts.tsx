"use client";
import { useId, useRef, useState } from "react";

/**
 * Charts for the error dashboard.
 *
 * Colour decisions, and why:
 *  - One data hue (blue) for every magnitude chart. Error counts per route are
 *    nominal categories, so colouring each bar differently would double-encode
 *    the length and buy nothing.
 *  - Severity uses the reserved status colours, but only ever as a dot next to
 *    its own written label. Validated against this surface, warn and error sit
 *    13.6 apart on the normal-vision scale — below the 15 floor — so hue alone
 *    must never be what tells them apart.
 *  - The hover state uses the mark's magenta end. Against the data blue it
 *    measures CVD deltaE 7.3, which is inside the warn band, so hover is never
 *    signalled by colour alone: the hovered row also gains a visible outline.
 */

export const SURFACE = "#0a0d1c";   // --ink-2
const HUE = "#3987e5";        // the single data colour
const HUE_SOFT = "#86b6ef";   // endpoint marker / emphasis within the same hue
const GRID = "#223055";       // one step off the surface, recessive
const ACCENT = "#e838fd";     // the sweep's magenta end; hover only, never data

export const LEVEL_COLOR: Record<string, string> = {
  warn: "#fab219",
  error: "#ec835a",
  fatal: "#d03b3b",
};

export const LEVEL_LABEL: Record<string, string> = {
  warn: "Warning",
  error: "Error",
  fatal: "Fatal",
};

/** Clean axis ticks: 0, 5, 10 rather than 0, 3.33, 6.66. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmt = (n: number) => n.toLocaleString();
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/* ------------------------------------------------------------------ */
/* Trend: one series over time. Area + line, crosshair tooltip.        */
/* ------------------------------------------------------------------ */

export type TrendPoint = { day: string; total: number; warn?: number; error?: number; fatal?: number };

export function TrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (data.length < 2)
    return <p className="py-10 text-center text-sm text-muted">Not enough days of data to draw a trend yet.</p>;

  const W = 760, H = height;
  const pad = { top: 16, right: 18, bottom: 26, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const max = Math.max(1, ...data.map((d) => d.total));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  const x = (i: number) => pad.left + (plotW * i) / (data.length - 1);
  const y = (v: number) => pad.top + plotH - (plotH * v) / top;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const last = data[data.length - 1];
  const peakIndex = data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0);
  const active = hover ?? null;
  const point = active !== null ? data[active] : null;

  // The pointer aims at a date, not at a 2px line: snap to the nearest column.
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const ratio = (px - pad.left) / plotW;
    const i = Math.round(ratio * (data.length - 1));
    setHover(i < 0 ? 0 : i > data.length - 1 ? data.length - 1 : i);
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y"
        // aspect-ratio, not a fixed height: with a fixed height the SVG is
        // letterboxed inside its container and the plot sits in a narrow band
        // with dead space either side.
        style={{ height: "auto", aspectRatio: `${W} / ${H}` }}
        role="img" aria-label={`Errors per day over the last ${data.length} days`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? 0) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? 0) - 1));
          if (e.key === "Escape") setHover(null);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HUE} stopOpacity="0.22" />
            <stop offset="100%" stopColor={HUE} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* gridlines: hairline, solid, recessive — never dashed */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94a0bd">{fmt(t)}</text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={HUE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* the peak and the latest point are the two worth labelling; not every point */}
        {peakIndex !== data.length - 1 && data[peakIndex].total > 0 && (
          <>
            <circle cx={x(peakIndex)} cy={y(data[peakIndex].total)} r="4" fill={HUE_SOFT} stroke={SURFACE} strokeWidth="2" />
            <text x={x(peakIndex)} y={y(data[peakIndex].total) - 10} textAnchor="middle" fontSize="11" fill="#eef1f8">
              {fmt(data[peakIndex].total)}
            </text>
          </>
        )}
        <circle cx={x(data.length - 1)} cy={y(last.total)} r="4.5" fill={HUE} stroke={SURFACE} strokeWidth="2" />
        <text x={x(data.length - 1) - 6} y={y(last.total) - 10} textAnchor="end" fontSize="11" fill="#eef1f8">
          {fmt(last.total)}
        </text>

        {/* x labels: first, middle, last — enough to orient without crowding */}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            fontSize="11" fill="#94a0bd">{dayLabel(data[i].day)}</text>
        ))}

        {active !== null && point && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke={ACCENT} strokeWidth="1" strokeOpacity="0.6" />
            <circle cx={x(active)} cy={y(point.total)} r="5" fill={ACCENT} stroke={SURFACE} strokeWidth="2" />
          </g>
        )}
      </svg>

      {active !== null && point && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-white/15 bg-[#0b1020]/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: `${((x(active) - pad.left) / plotW) * 100}%`,
            transform: active > data.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="font-semibold text-paper">{fmt(point.total)} {point.total === 1 ? "error" : "errors"}</p>
          <p className="mt-0.5 text-muted">{dayLabel(point.day)}</p>
          {(["fatal", "error", "warn"] as const).map((lvl) =>
            point[lvl] ? (
              <p key={lvl} className="mt-1 flex items-center gap-1.5 text-paper/80">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[lvl] }} />
                {fmt(point[lvl]!)} {LEVEL_LABEL[lvl].toLowerCase()}
              </p>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Routes: magnitude across nominal categories. One hue, bars.         */
/* ------------------------------------------------------------------ */

export function RouteBars({ rows }: { rows: { route: string; n: number }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">No errors to attribute yet.</p>;
  const max = Math.max(...rows.map((r) => r.n));

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = (r.n / max) * 100;
        const lit = hover === r.route;
        return (
          <li
            key={r.route}
            onPointerEnter={() => setHover(r.route)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(r.route)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            className="group rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-violet-400/60"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <code className="min-w-0 truncate text-paper/85">{r.route}</code>
              <span className="shrink-0 tabular-nums text-paper">{fmt(r.n)}</span>
            </div>
            {/* 10px track, 4px rounded data-end, grows from one baseline */}
            <div
              className="h-2.5 overflow-hidden rounded-r-[4px] bg-white/[0.06] transition-shadow duration-200"
              // The ring is the real hover signal; the colour change supports it.
              style={lit ? { boxShadow: `0 0 0 1.5px ${ACCENT}` } : undefined}
            >
              <div
                className="h-full rounded-r-[4px] transition-[width,background-color] duration-500"
                style={{ width: `${Math.max(2, pct)}%`, background: lit ? ACCENT : HUE }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Severity: status colour as a dot beside its own label, never alone.  */
/* ------------------------------------------------------------------ */

export function LevelRows({ counts }: { counts: Record<string, number> }) {
  const order = ["fatal", "error", "warn"];
  const rows = order.map((k) => ({ level: k, n: counts[k] ?? 0 }));
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted">Nothing recorded in this window.</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.level}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-paper/85">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[r.level] }} />
              {LEVEL_LABEL[r.level]}
            </span>
            <span className="shrink-0 tabular-nums text-paper">
              {fmt(r.n)}
              <span className="ml-1.5 text-muted">{total ? `${Math.round((r.n / total) * 100)}%` : ""}</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-r-[4px] bg-white/[0.06]">
            <div className="h-full rounded-r-[4px] transition-[width] duration-500"
              style={{ width: `${Math.max(r.n ? 2 : 0, (r.n / max) * 100)}%`, background: HUE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline for a stat tile. No axes, no tooltip — the tile's number   */
/* is the value; this is only the shape.                                */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, width = 108, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (width * i) / (values.length - 1);
  const y = (v: number) => height - 2 - ((height - 6) * v) / max;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={HUE} fillOpacity="0.1" />
      <path d={d} fill="none" stroke={HUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
