import {
  DotFlowStage,
  ZONE_COLORS,
  ZONE_ORDER,
  easeInOutCubic,
  type FlowFeel,
  type FlowLayout,
  type Pt,
} from "./DotFlowStage";
import { FRAME_COUNTS } from "../clusterModel";
import { useCountLabels } from "./useCountLabels";

/* Tuning knobs: change these to adjust the feel */
const FEEL: FlowFeel = {
  travelMs: 1100, // time for one hop between steps
  travelJitterMs: 300,
  dotStaggerMs: 110,
  stageStaggerMs: 160,
  backwardDelayMs: 500,
  arcMin: 40, // how high dots hop
  arcRange: 22,
  wiggle: 0.4,
  bounce: 7, // little bounce when a dot lands
  ease: easeInOutCubic,
  colorSwap: 0.25,
  trailMs: 0,
  trailOpacity: 0,
};

type StairOpts = {
  w: number;
  h: number;
  x0: number;
  stepW: number;
  rise: number;
  baseY: number;
  perRow: number;
  spacing: number;
  dotR: number;
  labelSize: number;
};

const DESKTOP: StairOpts = { w: 1000, h: 460, x0: 25, stepW: 190, rise: 62, baseY: 400, perRow: 11, spacing: 16, dotR: 6, labelSize: 22 };
const MOBILE: StairOpts = { w: 360, h: 720, x0: 10, stepW: 68, rise: 72, baseY: 640, perRow: 4, spacing: 14.5, dotR: 5, labelSize: 16 };

const stepTop = (o: StairOpts, z: number) => o.baseY - z * o.rise;

function makeLayout(o: StairOpts): FlowLayout {
  return {
    w: o.w,
    h: o.h,
    dotR: o.dotR,
    leaveFrom: "top",
    slotPos: (z, k) => {
      const col = k % o.perRow;
      const row = Math.floor(k / o.perRow);
      const rowW = (o.perRow - 1) * o.spacing;
      const shift = row % 2 ? o.spacing * 0.25 : -o.spacing * 0.25;
      return {
        x: o.x0 + z * o.stepW + (o.stepW - rowW) / 2 + col * o.spacing + shift,
        y: stepTop(o, z) - o.dotR - 3 - row * o.spacing * 0.9,
      };
    },
    zoneAt: (p) => {
      const z = Math.floor((p.x - o.x0) / o.stepW);
      return z >= 0 && z < ZONE_ORDER.length ? z : -1;
    },
    center: (z) => ({ x: o.x0 + z * o.stepW + o.stepW / 2, y: stepTop(o, z) - 30 }),
    path: (f: Pt, t: Pt, e, arc, backward) => {
      // Forward: hop up and over. Backward: slide off the edge and drop down.
      const c = backward
        ? { x: t.x + (f.x - t.x) * 0.1, y: f.y - 8 }
        : { x: (f.x + t.x) / 2, y: Math.min(f.y, t.y) - arc };
      const u = 1 - e;
      return {
        x: u * u * f.x + 2 * u * e * c.x + e * e * t.x,
        y: u * u * f.y + 2 * u * e * c.y + e * e * t.y,
      };
    },
  };
}

const D = makeLayout(DESKTOP);
const M = makeLayout(MOBILE);

export function StaircaseFunnel({ stepVh = 70 }: { stepVh?: number }) {
  const labels = useCountLabels();
  return (
    <DotFlowStage
      desktop={D}
      mobile={M}
      feel={FEEL}
      stepVh={stepVh}
      ariaLabel="Scroll-driven staircase of five colored steps with dots hopping between them"
      onTick={labels.onTick}
      background={(_, vertical) => {
        const o = vertical ? MOBILE : DESKTOP;
        return ZONE_ORDER.map((z, i) => {
          const x = o.x0 + i * o.stepW;
          const top = stepTop(o, i);
          return (
            <g key={z}>
              <rect x={x} y={top} width={o.stepW} height={o.h - top} fill={ZONE_COLORS[i]} fillOpacity={0.12} />
              <line x1={x} x2={x + o.stepW} y1={top} y2={top} stroke={ZONE_COLORS[i]} strokeWidth={2} />
            </g>
          );
        });
      }}
      foreground={(_, vertical) => {
        const o = vertical ? MOBILE : DESKTOP;
        return ZONE_ORDER.map((z, i) => (
          <text
            key={z}
            ref={labels.setRef(i)}
            x={o.x0 + i * o.stepW + o.stepW / 2}
            y={stepTop(o, i) + o.labelSize + 12}
            textAnchor="middle"
            className="flow-count"
            fontSize={o.labelSize}
            fill={ZONE_COLORS[i]}
          >
            {FRAME_COUNTS[0][i]}
          </text>
        ));
      }}
    />
  );
}
