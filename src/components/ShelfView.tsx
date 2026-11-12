"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Section, Spine } from "@/lib/db";

export interface Highlight {
  x0: number;
  x1: number;
  kind: "exact" | "estimate";
  primary?: boolean;
}

export function usePhotoUrl(photo: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return url;
}

/**
 * The shelf photo with a heat-map overlay: everything dims except the places
 * the search points to. In edit mode, every detected spine is outlined and tappable.
 */
export default function ShelfView({
  section,
  highlights = [],
  spines,
  selectedSpineId,
  onSpineTap,
  onPhotoTap,
}: {
  section: Section;
  highlights?: Highlight[];
  spines?: Spine[];
  selectedSpineId?: string;
  onSpineTap?: (s: Spine) => void;
  /** When set, tapping the photo (not a spine) reports where, as 0–1 of the width. */
  onPhotoTap?: (x: number) => void;
}) {
  const url = usePhotoUrl(section.photo);
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = section;
  const primary = highlights.find((h) => h.primary) ?? highlights[0];
  const veil = highlights.length > 0;

  // When zoomed, bring the main highlight into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !primary) return;
    const centre = ((primary.x0 + primary.x1) / 2) * el.scrollWidth;
    el.scrollTo({ left: centre - el.clientWidth / 2, behavior: "smooth" });
  }, [zoom, primary]);

  const maskId = useMemo(() => `m${section.id.slice(0, 8)}`, [section.id]);
  const blur = W * 0.012;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-2">
      <div ref={scroller} className="no-scrollbar overflow-x-auto">
        <div
          className={`relative ${onPhotoTap ? "cursor-crosshair" : ""}`}
          style={{ width: `${zoom * 100}%`, aspectRatio: `${W} / ${H}` }}
          onClick={(e) => {
            if (!onPhotoTap) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPhotoTap(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
          }}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={section.name} className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
          )}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <filter id={`${maskId}-b`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={blur} />
              </filter>
              <mask id={maskId}>
                <rect width={W} height={H} fill="white" />
                {highlights.map((h, i) => (
                  <rect
                    key={i}
                    x={h.x0 * W}
                    width={Math.max((h.x1 - h.x0) * W, W * 0.01)}
                    y={0}
                    height={H}
                    fill="black"
                    opacity={h.kind === "exact" ? 1 : 0.7}
                    filter={`url(#${maskId}-b)`}
                  />
                ))}
              </mask>
            </defs>
            {veil && <rect width={W} height={H} fill="black" opacity={0.68} mask={`url(#${maskId})`} />}
            {highlights.map((h, i) => {
              const x = h.x0 * W;
              const w = Math.max((h.x1 - h.x0) * W, W * 0.01);
              return (
                <g key={i} className={h.primary ? "glow-pulse" : undefined}>
                  <rect x={x} y={H * 0.01} width={w} height={H * 0.98} rx={W * 0.004} fill="none" stroke="var(--accent)" strokeWidth={W * (h.kind === "exact" ? 0.005 : 0.003)} strokeDasharray={h.kind === "estimate" ? `${W * 0.015} ${W * 0.01}` : undefined} opacity={h.primary ? 1 : 0.7} />
                  <rect x={x} y={0} width={w} height={H} fill="var(--accent)" opacity={h.kind === "exact" ? 0.16 : 0.1} filter={`url(#${maskId}-b)`} />
                </g>
              );
            })}
            {spines?.map((s) => {
              const sel = s.id === selectedSpineId;
              const colour = s.recordId ? (s.matchedBy === "user" ? "var(--ok)" : "#ffffff") : "var(--warn)";
              return (
                <rect
                  key={s.id}
                  x={s.x0 * W}
                  y={H * 0.02}
                  width={Math.max((s.x1 - s.x0) * W, 2)}
                  height={H * 0.96}
                  fill={sel ? "var(--accent)" : colour}
                  fillOpacity={sel ? 0.35 : 0.08}
                  stroke={sel ? "var(--accent)" : colour}
                  strokeOpacity={sel ? 1 : 0.75}
                  strokeWidth={W * (sel ? 0.004 : 0.0018)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpineTap?.(s);
                  }}
                  className="cursor-pointer"
                />
              );
            })}
          </svg>
          {primary && (
            <div
              className="drop-in pointer-events-none absolute -top-1 -translate-x-1/2"
              style={{ left: `${((primary.x0 + primary.x1) / 2) * 100}%` }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" className="drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]">
                <path d="M12 21 4 9h16z" fill="var(--accent)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => setZoom((z) => (z === 1 ? 2.5 : 1))}
        className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
      >
        {zoom === 1 ? "Zoom in" : "Zoom out"}
      </button>
    </div>
  );
}
