"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* Chart palette (validated reference palette, light mode). Colour follows the
   entity: KB is always blue, web always orange, everything else neutral. */
export const COLORS = {
    kb: "#2a78d6",
    web: "#eb6834",
    other: "#b9b8b2",
    grid: "#e7e6e2",
    axis: "#8a8984",
    text: "#52514e",
};
// Sequential blue ramp for the heatmap (light -> dark = fewer -> more)
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const EMPTY_CELL = "#f3f2ef";

export function useWidth<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);
    return { ref, width };
}

function niceMax(v: number): number {
    if (v <= 5) return 5;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
    return (
        <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-lg whitespace-nowrap"
            style={{ left: x, top: y - 8 }}
        >
            {children}
        </div>
    );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
    return (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
            {items.map((i) => (
                <span key={i.label} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
                    {i.label}
                </span>
            ))}
        </div>
    );
}

export type StackedPoint = { label: string; kb: number; web: number; other: number };

/** Stacked bars: KB (bottom), web, other. Hover a column for exact numbers. */
export function StackedBars({ data, height = 240 }: { data: StackedPoint[]; height?: number }) {
    const { ref, width } = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const padL = 40, padR = 8, padT = 12, padB = 28;
    const innerW = Math.max(0, width - padL - padR);
    const innerH = height - padT - padB;
    const max = niceMax(Math.max(1, ...data.map((d) => d.kb + d.web + d.other)));
    const slot = data.length ? innerW / data.length : 0;
    const barW = Math.max(2, Math.min(28, slot * 0.7));
    const y = (v: number) => padT + innerH - (v / max) * innerH;
    const ticks = [0, max / 2, max];
    const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64))));

    return (
        <div ref={ref} className="relative w-full" style={{ height }}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label="Questions over time">
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={COLORS.grid} />
                            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={COLORS.axis}>
                                {Math.round(t).toLocaleString()}
                            </text>
                        </g>
                    ))}
                    {data.map((d, i) => {
                        const cx = padL + slot * i + slot / 2;
                        const x = cx - barW / 2;
                        const segs = [
                            { v: d.kb, c: COLORS.kb },
                            { v: d.web, c: COLORS.web },
                            { v: d.other, c: COLORS.other },
                        ];
                        let acc = 0;
                        const total = d.kb + d.web + d.other;
                        const topIndex = segs.map((s) => s.v > 0).lastIndexOf(true);
                        return (
                            <g key={d.label}>
                                {segs.map((s, si) => {
                                    if (s.v <= 0) return null;
                                    const y0 = y(acc);
                                    acc += s.v;
                                    const y1 = y(acc);
                                    const h = Math.max(1, y0 - y1 - (si < topIndex ? 2 : 0)); // 2px gap between segments
                                    const r = si === topIndex ? Math.min(4, barW / 2, h) : 0;
                                    return (
                                        <path
                                            key={si}
                                            d={`M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y1 + h} Z`}
                                            fill={s.c}
                                            opacity={hover === null || hover === i ? 1 : 0.45}
                                        />
                                    );
                                })}
                                {i % labelEvery === 0 && (
                                    <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={COLORS.axis}>
                                        {d.label}
                                    </text>
                                )}
                                <rect
                                    x={padL + slot * i}
                                    y={padT}
                                    width={slot}
                                    height={innerH}
                                    fill="transparent"
                                    onMouseEnter={() => setHover(i)}
                                    onMouseLeave={() => setHover(null)}
                                >
                                    <title>{`${d.label}: ${total} questions`}</title>
                                </rect>
                            </g>
                        );
                    })}
                    <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke={COLORS.axis} />
                </svg>
            )}
            {hover !== null && data[hover] && (
                <Tooltip x={padL + slot * hover + slot / 2} y={y(data[hover].kb + data[hover].web + data[hover].other)}>
                    <div className="font-semibold text-zinc-900">{data[hover].label}</div>
                    <div>{(data[hover].kb + data[hover].web + data[hover].other).toLocaleString()} questions</div>
                    <div className="mt-1 flex gap-3 text-zinc-500">
                        <span>KB {data[hover].kb}</span>
                        <span>Web {data[hover].web}</span>
                        <span>Other {data[hover].other}</span>
                    </div>
                </Tooltip>
            )}
        </div>
    );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Day-of-week x hour heatmap. `cells` uses ISO weekday (1 = Monday). */
export function Heatmap({ cells }: { cells: Array<{ dow: number; hour: number; questions: number }> }) {
    const { ref, width } = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<{ dow: number; hour: number; v: number; x: number; y: number } | null>(null);
    const grid = new Map<string, number>();
    for (const c of cells) grid.set(`${c.dow}-${c.hour}`, c.questions);
    const max = Math.max(0, ...cells.map((c) => c.questions));
    const padL = 36, padT = 4, padB = 22;
    const gap = 2;
    const cell = width ? Math.max(8, (width - padL - gap * 23) / 24) : 0;
    const cellH = Math.min(26, Math.max(14, cell * 0.8));
    const height = padT + (cellH + gap) * 7 + padB;
    const color = (v: number) => {
        if (!v || !max) return EMPTY_CELL;
        const idx = Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length));
        return RAMP[idx];
    };

    return (
        <div ref={ref} className="relative w-full" style={{ height }}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label="Questions by weekday and hour">
                    {DAYS.map((d, di) => (
                        <text key={d} x={0} y={padT + (cellH + gap) * di + cellH / 2 + 4} fontSize={11} fill={COLORS.axis}>
                            {d}
                        </text>
                    ))}
                    {DAYS.map((_, di) =>
                        Array.from({ length: 24 }, (_, h) => {
                            const v = grid.get(`${di + 1}-${h}`) || 0;
                            const x = padL + (cell + gap) * h;
                            const yy = padT + (cellH + gap) * di;
                            return (
                                <rect
                                    key={`${di}-${h}`}
                                    x={x}
                                    y={yy}
                                    width={cell}
                                    height={cellH}
                                    rx={3}
                                    fill={color(v)}
                                    stroke={hover && hover.dow === di && hover.hour === h ? "#0b0b0b" : "none"}
                                    onMouseEnter={() => setHover({ dow: di, hour: h, v, x: x + cell / 2, y: yy })}
                                    onMouseLeave={() => setHover(null)}
                                >
                                    <title>{`${DAYS[di]} ${String(h).padStart(2, "0")}:00: ${v} questions`}</title>
                                </rect>
                            );
                        })
                    )}
                    {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                        <text key={h} x={padL + (cell + gap) * h} y={height - 6} fontSize={11} fill={COLORS.axis}>
                            {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                        </text>
                    ))}
                </svg>
            )}
            {hover && (
                <Tooltip x={hover.x} y={hover.y}>
                    <div className="font-semibold text-zinc-900">
                        {DAYS[hover.dow]} {String(hover.hour).padStart(2, "0")}:00–{String(hover.hour).padStart(2, "0")}:59
                    </div>
                    <div>{hover.v.toLocaleString()} questions</div>
                </Tooltip>
            )}
        </div>
    );
}

export function HeatmapScale() {
    return (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Fewer</span>
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: EMPTY_CELL }} />
            {RAMP.map((c) => (
                <span key={c} className="inline-block h-2.5 w-4 rounded-sm" style={{ background: c }} />
            ))}
            <span>More</span>
        </div>
    );
}

/** Simple ranked horizontal bars (agents). */
export function RankedBars({ rows }: { rows: Array<{ label: string; value: number; web: number }> }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
        <ul className="space-y-2.5">
            {rows.map((r) => (
                <li key={r.label} className="text-sm">
                    <div className="mb-1 flex justify-between gap-3 text-zinc-700">
                        <span className="truncate">{r.label}</span>
                        <span className="tabular-nums text-zinc-500">
                            {r.value.toLocaleString()}
                            {r.web > 0 && <span className="ml-2 text-xs">({Math.round((r.web / r.value) * 100)}% web)</span>}
                        </span>
                    </div>
                    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded bg-zinc-100">
                        <div className="h-full rounded-l" style={{ width: `${((r.value - r.web) / max) * 100}%`, background: COLORS.kb }} />
                        {r.web > 0 && <div className="h-full rounded-r" style={{ width: `${(r.web / max) * 100}%`, background: COLORS.web }} />}
                    </div>
                </li>
            ))}
        </ul>
    );
}
