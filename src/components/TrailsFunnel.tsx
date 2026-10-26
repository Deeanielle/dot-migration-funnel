import { useCallback, useRef } from "react";
import {
  DotFlowStage,
  ZONE_COLORS,
  ZONE_ORDER,
  easeOutCubic,
  type FlowFeel,
  type FlowLayout,
  type Pt,
} from "./DotFlowStage";

/* Tuning knobs: change these to adjust the feel */
const FEEL: FlowFeel = {
  travelMs: 1700, // time for one dot to float between columns
  travelJitterMs: 600,
  dotStaggerMs: 90,
  stageStaggerMs: 140,
  backwardDelayMs: 450,
  arcMin: 14,
  arcRange: 26,
  wiggle: 1.6,
  bounce: 0,
  ease: easeOutCubic,
  colorSwap: 0.18,
  trailMs: 900, // tail length: higher = longer tails that linger
  trailOpacity: 0.5, // how strong the tail is right behind the dot
};

const SPACING = 11;
const SCATTER = 2.5;
const GRADIENT_MAX = [0.22, 0.34, 0.42, 0.36, 0.26];
const GRADIENT_MIN = 0.06;
const FULL_COUNT = 53;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type Rect = { x: number; y: number; w: number; h: number };

function cloudOffset(k: number): Pt {
  const r = SPACING * Math.sqrt(k + 0.5);
  const a = k * GOLDEN;
  return {
    x: r * Math.cos(a) + Math.sin(k * 12.9898) * SCATTER,
    y: r * Math.sin(a) + Math.sin(k * 78.233) * SCATTER,
  };
}

function makeLayout(w: number, h: number, panels: Rect[]): FlowLayout {
  const center = (z: number) => ({ x: panels[z].x + panels[z].w / 2, y: panels[z].y + panels[z].h / 2 });
  return {
    w,
    h,
    dotR: 5.5,
    leaveFrom: "rim",
    center,
    slotPos: (z, k) => {
      const c = center(z);
      const o = cloudOffset(k);
      return { x: c.x + o.x, y: c.y + o.y };
    },
    zoneAt: (p) =>
      panels.findIndex((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h),
    path: (f, t, e, arc) => {
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (f.x + t.x) / 2 + (dy / len) * arc;
      const cy = (f.y + t.y) / 2 + (-dx / len) * arc;
      const u = 1 - e;
      return {
        x: u * u * f.x + 2 * u * e * cx + e * e * t.x,
        y: u * u * f.y + 2 * u * e * cy + e * e * t.y,
      };
    },
  };
}

const D_PANELS = ZONE_ORDER.map((_, i) => ({ x: i * 200, y: 0, w: 200, h: 300 }));
const M_PANELS = ZONE_ORDER.map((_, i) => ({ x: 0, y: i * 220, w: 340, h: 220 }));
const D = makeLayout(1000, 300, D_PANELS);
const M = makeLayout(340, 1100, M_PANELS);

export function TrailsFunnel({ stepVh = 70 }: { stepVh?: number }) {
  const stops = useRef<(SVGStopElement | null)[]>([]);
  const alpha = useRef(ZONE_ORDER.map(() => GRADIENT_MIN));
  const onTick = useCallback((live: number[]) => {
    live.forEach((n, z) => {
      const target = GRADIENT_MIN + (GRADIENT_MAX[z] - GRADIENT_MIN) * Math.min(1, n / FULL_COUNT);
      alpha.current[z] += (target - alpha.current[z]) * 0.04;
      stops.current[z]?.setAttribute("stop-opacity", alpha.current[z].toFixed(3));
    });
  }, []);

  return (
    <DotFlowStage
      desktop={D}
      mobile={M}
      feel={FEEL}
      stepVh={stepVh}
      cardClassName="cluster-card"
      ariaLabel="Scroll-driven chart of dots with fading tails floating between five colored columns"
      onTick={onTick}
      background={(_, vertical) => {
        const panels = vertical ? M_PANELS : D_PANELS;
        const w = vertical ? 340 : 1000;
        const h = vertical ? 1100 : 300;
        return (
          <>
            <defs>
              {ZONE_ORDER.map((z, i) => (
                <linearGradient key={z} id={`trail-grad-${z}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ZONE_COLORS[i]} stopOpacity={0} />
                  <stop
                    offset="100%"
                    stopColor={ZONE_COLORS[i]}
                    stopOpacity={GRADIENT_MIN}
                    ref={(el) => {
                      stops.current[i] = el;
                    }}
                  />
                </linearGradient>
              ))}
            </defs>
            {panels.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={`url(#trail-grad-${ZONE_ORDER[i]})`} />
            ))}
            {panels.slice(1).map((p, i) =>
              vertical ? (
                <line key={i} x1={0} x2={w} y1={p.y} y2={p.y} className="cluster-divider" />
              ) : (
                <line key={i} x1={p.x} x2={p.x} y1={0} y2={h} className="cluster-divider" />
              ),
            )}
          </>
        );
      }}
    />
  );
}
