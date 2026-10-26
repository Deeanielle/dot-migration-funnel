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
  travelMs: 1300, // time to rise out, float over and drop in
  travelJitterMs: 400,
  dotStaggerMs: 110,
  stageStaggerMs: 160,
  backwardDelayMs: 500,
  arcMin: 20, // extra height above the tubes
  arcRange: 30,
  wiggle: 0.3,
  bounce: 8, // little bounce when a dot lands on the stack
  ease: easeInOutCubic,
  colorSwap: 0.25,
  trailMs: 0,
  trailOpacity: 0,
};

type TubeOpts = {
  w: number;
  h: number;
  cx0: number;
  gap: number;
  tubeW: number;
  top: number;
  bottom: number;
  perRow: number;
  spacing: number;
  dotR: number;
  labelY: number;
  labelSize: number;
};

const DESKTOP: TubeOpts = { w: 1000, h: 440, cx0: 100, gap: 200, tubeW: 112, top: 90, bottom: 380, perRow: 6, spacing: 15.5, dotR: 6, labelY: 418, labelSize: 22 };
const MOBILE: TubeOpts = { w: 360, h: 620, cx0: 40, gap: 70, tubeW: 56, top: 100, bottom: 560, perRow: 3, spacing: 14, dotR: 5, labelY: 592, labelSize: 16 };

const tubeX = (o: TubeOpts, z: number) => o.cx0 + z * o.gap;

function makeLayout(o: TubeOpts): FlowLayout {
  return {
    w: o.w,
    h: o.h,
    dotR: o.dotR,
    leaveFrom: "top",
    slotPos: (z, k) => {
      const col = k % o.perRow;
      const row = Math.floor(k / o.perRow);
      const shift = row % 2 ? o.spacing * 0.15 : -o.spacing * 0.15;
      return {
        x: tubeX(o, z) - ((o.perRow - 1) * o.spacing) / 2 + col * o.spacing + shift,
        y: o.bottom - o.dotR - 6 - row * o.spacing * 0.9,
      };
    },
    zoneAt: (p) => {
      const z = Math.round((p.x - o.cx0) / o.gap);
      return z >= 0 && z < ZONE_ORDER.length ? z : -1;
    },
    center: (z) => ({ x: tubeX(o, z), y: o.bottom - 60 }),
    path: (f: Pt, t: Pt, e, arc, backward) => {
      // Rise straight up out of the tube, float over the wall, drop into the next one.
      // Backward moves skim lower over the wall.
      const lane = o.top - (backward ? 12 : 30) - arc * 0.4;
      const u = 1 - e;
      return {
        x: u * u * u * f.x + 3 * u * u * e * f.x + 3 * u * e * e * t.x + e * e * e * t.x,
        y: u * u * u * f.y + 3 * u * u * e * lane + 3 * u * e * e * lane + e * e * e * t.y,
      };
    },
  };
}

const D = makeLayout(DESKTOP);
const M = makeLayout(MOBILE);

function tubePath(o: TubeOpts, z: number) {
  const l = tubeX(o, z) - o.tubeW / 2;
  const r = tubeX(o, z) + o.tubeW / 2;
  const rad = o.tubeW / 2;
  return `M ${l} ${o.top} L ${l} ${o.bottom - rad} A ${rad} ${rad} 0 0 0 ${r} ${o.bottom - rad} L ${r} ${o.top}`;
}

export function TubesFunnel({ stepVh = 70 }: { stepVh?: number }) {
  const labels = useCountLabels();
  return (
    <DotFlowStage
      desktop={D}
      mobile={M}
      feel={FEEL}
      stepVh={stepVh}
      ariaLabel="Scroll-driven chart of five colored tubes with dots dropping between them"
      onTick={labels.onTick}
      background={(_, vertical) => {
        const o = vertical ? MOBILE : DESKTOP;
        return ZONE_ORDER.map((z, i) => (
          <g key={z}>
            <path d={tubePath(o, i)} fill={ZONE_COLORS[i]} fillOpacity={0.07} stroke="none" />
            <path d={tubePath(o, i)} fill="none" stroke={ZONE_COLORS[i]} strokeOpacity={0.4} strokeWidth={1.5} />
            <line
              x1={tubeX(o, i) - o.tubeW / 2 - 4}
              x2={tubeX(o, i) - o.tubeW / 2 + 4}
              y1={o.top}
              y2={o.top}
              stroke={ZONE_COLORS[i]}
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
            <line
              x1={tubeX(o, i) + o.tubeW / 2 - 4}
              x2={tubeX(o, i) + o.tubeW / 2 + 4}
              y1={o.top}
              y2={o.top}
              stroke={ZONE_COLORS[i]}
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
          </g>
        ));
      }}
      foreground={(_, vertical) => {
        const o = vertical ? MOBILE : DESKTOP;
        return ZONE_ORDER.map((z, i) => (
          <text
            key={z}
            ref={labels.setRef(i)}
            x={tubeX(o, i)}
            y={o.labelY}
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
