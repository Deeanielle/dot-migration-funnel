import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FRAME_COUNTS,
  MAX_DOTS,
  ZONE_COLORS,
  ZONE_ORDER,
} from "../clusterModel";

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/*  Tuning knobs: change these to adjust the feel                     */
/* ------------------------------------------------------------------ */

const DOT_R = 6; // dot radius
const SPACING = 15.5; // distance between dots inside a cluster
const TRAVEL_MS = 1500; // how long one dot takes to float between clusters
const TRAVEL_JITTER_MS = 500; // random extra travel time so dots don't move in lockstep
const DOT_STAGGER_MS = 85; // gap between dots leaving the same cluster
const STAGE_STAGGER_MS = 140; // gap between clusters starting their moves (left to right wave)
const BACKWARD_DELAY_MS = 450; // backward moves start a beat after forward moves
const ARC_MIN = 28; // how high the float path curves
const ARC_RANGE = 36;
const FLOAT_AMOUNT = 1; // 0 = still clusters, 1 = default bobbing, 2 = twice as much

const POOL = MAX_DOTS + 6;
const PHYLLO_C = SPACING * 0.54;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };
type Layout = {
  w: number;
  h: number;
  vertical: boolean;
  centers: Pt[];
  labels: Pt[];
};

const H_CENTERS: Pt[] = [
  { x: 70, y: 150 },
  { x: 255, y: 150 },
  { x: 475, y: 150 },
  { x: 700, y: 150 },
  { x: 905, y: 150 },
];
const H_LAYOUT: Layout = {
  w: 1000,
  h: 280,
  vertical: false,
  centers: H_CENTERS,
  labels: H_CENTERS.map((c) => ({ x: c.x, y: 262 })),
};

const V_CENTERS: Pt[] = [
  { x: 150, y: 60 },
  { x: 150, y: 215 },
  { x: 150, y: 430 },
  { x: 150, y: 660 },
  { x: 150, y: 860 },
];
const V_LAYOUT: Layout = {
  w: 340,
  h: 940,
  vertical: true,
  centers: V_CENTERS,
  labels: V_CENTERS.map((c) => ({ x: 262, y: c.y + 9 })),
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const ZONE_RGB = ZONE_COLORS.map(hexToRgb);

function slotOffset(k: number): Pt {
  const r = PHYLLO_C * Math.sqrt(k + 0.5);
  const a = k * GOLDEN;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

function clusterRadius(n: number): number {
  return n > 0 ? PHYLLO_C * Math.sqrt(n) + DOT_R : 0;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type Dot = {
  zone: number; // -1 = hidden
  prevZone: number;
  slot: number;
  fromX: number;
  fromY: number;
  fromColor: RGB;
  fromOpacity: number;
  toOpacity: number;
  start: number;
  dur: number;
  arc: number;
  phase: number;
  x: number;
  y: number;
  color: RGB;
  opacity: number;
};

type Props = {
  /** Scroll distance per step, in viewport heights. */
  stepVh?: number;
  className?: string;
};

export function FloatingClusterFunnel({ stepVh = 70, className }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const discRefs = useRef<(SVGCircleElement | null)[]>([]);
  const labelRefs = useRef<(SVGTextElement | null)[]>([]);

  const [vertical, setVertical] = useState(
    () => window.matchMedia("(max-width: 640px)").matches,
  );
  const [step, setStep] = useState(0);
  const layout = vertical ? V_LAYOUT : H_LAYOUT;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setVertical(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const floatAmt = reduced ? 0 : FLOAT_AMOUNT;

    const dots: Dot[] = Array.from({ length: POOL }, (_, i) => ({
      zone: -1,
      prevZone: -1,
      slot: 0,
      fromX: 0,
      fromY: 0,
      fromColor: [226, 226, 226],
      fromOpacity: 0,
      toOpacity: 0,
      start: 0,
      dur: 1,
      arc: 0,
      phase: (i * 2.399) % (Math.PI * 2),
      x: 0,
      y: 0,
      color: [226, 226, 226],
      opacity: 0,
    }));

    const discR = ZONE_ORDER.map(() => 16);
    const shownCounts = ZONE_ORDER.map(() => -1);

    const bob = (z: number, now: number): Pt => ({
      x: Math.sin(now * 0.0006 + z * 1.7) * 2.5 * floatAmt,
      y: Math.sin(now * 0.0008 + z * 2.3) * 4 * floatAmt,
    });

    const homeOf = (d: Dot, now: number): Pt => {
      const L = layoutRef.current;
      if (d.zone < 0) return { x: d.fromX, y: d.fromY };
      const c = L.centers[d.zone];
      const b = bob(d.zone, now);
      const o = slotOffset(d.slot);
      return {
        x: c.x + b.x + o.x + Math.sin(now * 0.0013 + d.phase) * 0.9 * floatAmt,
        y:
          c.y +
          b.y +
          o.y +
          Math.cos(now * 0.0011 + d.phase * 1.3) * 0.9 * floatAmt,
      };
    };

    /** Start a new animation for a dot from wherever it is drawn right now. */
    const launch = (
      d: Dot,
      opts: { zone: number; slot: number; delay: number; dur: number; arc: number; toOpacity?: number },
      now: number,
    ) => {
      d.prevZone = d.zone;
      d.fromX = d.x;
      d.fromY = d.y;
      d.fromColor = [...d.color];
      d.fromOpacity = d.opacity;
      d.zone = opts.zone;
      d.slot = opts.slot;
      d.start = now + (reduced ? 0 : opts.delay);
      d.dur = reduced ? 1 : opts.dur;
      d.arc = reduced ? 0 : opts.arc;
      d.toOpacity = opts.toOpacity ?? 1;
    };

    const membersOf = (z: number) =>
      dots.filter((d) => d.zone === z).sort((a, b) => a.slot - b.slot);

    const dirBetween = (a: number, b: number): Pt => {
      const L = layoutRef.current;
      const dx = L.centers[b].x - L.centers[a].x;
      const dy = L.centers[b].y - L.centers[a].y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };

    /** Pick n dots from the rim of a cluster, on the side facing the destination. */
    const pickLeavers = (list: Dot[], n: number, toward: Pt): Dot[] => {
      if (n <= 0) return [];
      const pool = list.slice(-Math.max(n * 3, 8));
      return pool
        .map((d) => {
          const o = slotOffset(d.slot);
          return { d, score: o.x * toward.x + o.y * toward.y };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, n)
        .map((s) => s.d);
    };

    /** Move every dot so stage counts match `target`. */
    const goTo = (target: number[]) => {
      const now = performance.now();
      const n = ZONE_ORDER.length;
      const lists = ZONE_ORDER.map((_, z) => membersOf(z));

      // 1. Balance totals: spawn or fade out dots if the frame totals differ.
      const counts = lists.map((l) => l.length);
      const eff = [...target];
      let diff = target.reduce((a, b) => a + b, 0) - counts.reduce((a, b) => a + b, 0);
      const spawnZones: number[] = [];
      while (diff > 0) {
        let best = 0;
        for (let z = 1; z < n; z++)
          if (eff[z] - counts[z] > eff[best] - counts[best]) best = z;
        spawnZones.push(best);
        eff[best] -= 1;
        diff--;
      }
      while (diff < 0) {
        let best = 0;
        for (let z = 1; z < n; z++)
          if (eff[z] - counts[z] < eff[best] - counts[best]) best = z;
        const victim = lists[best].pop();
        if (victim) {
          launch(victim, { zone: -1, slot: 0, delay: 0, dur: 700, arc: 0, toOpacity: 0 }, now);
          counts[best] -= 1;
        }
        diff++;
      }

      // 2. Net flow across each boundary: positive = forward, negative = backward.
      const flows: number[] = [];
      let run = 0;
      for (let z = 0; z < n - 1; z++) {
        run += counts[z] - eff[z];
        flows.push(run);
      }

      type Trip = { dot: Dot; from: number; to: number; delay: number };
      const trips: Trip[] = [];
      const leaving = new Set<Dot>();

      for (let z = 0; z < n; z++) {
        const list = lists[z].filter((d) => d.zone === z);
        const fwd = z < n - 1 ? Math.max(flows[z], 0) : 0;
        const back = z > 0 ? Math.max(-flows[z - 1], 0) : 0;
        const fwdDots = pickLeavers(list, Math.min(fwd, list.length), dirBetween(z, z + 1 < n ? z + 1 : z));
        fwdDots.forEach((d) => leaving.add(d));
        const rest = list.filter((d) => !leaving.has(d));
        const backDots = z > 0 ? pickLeavers(rest, Math.min(back, rest.length), dirBetween(z, z - 1)) : [];
        backDots.forEach((d) => leaving.add(d));

        fwdDots.forEach((dot, j) =>
          trips.push({
            dot,
            from: z,
            to: z + 1,
            delay: z * STAGE_STAGGER_MS + j * DOT_STAGGER_MS + Math.random() * 90,
          }),
        );
        backDots.forEach((dot, j) =>
          trips.push({
            dot,
            from: z,
            to: z - 1,
            delay:
              BACKWARD_DELAY_MS + z * STAGE_STAGGER_MS + j * DOT_STAGGER_MS * 1.6 + Math.random() * 120,
          }),
        );
      }

      // 3. Keepers re-pack into the inner slots (small settle if a hole opened up).
      const keepersByZone = lists.map((l) => l.filter((d) => !leaving.has(d) && d.zone >= 0));
      keepersByZone.forEach((keepers, z) =>
        keepers.forEach((d, i) => {
          if (d.slot !== i) {
            launch(d, { zone: z, slot: i, delay: 250 + Math.random() * 300, dur: 1100, arc: 0 }, now);
          }
        }),
      );

      // 4. Arrivals take the outer slots, nearest-to-source first.
      for (let z = 0; z < n; z++) {
        const arrivals = trips
          .filter((t) => t.to === z)
          .sort((a, b) => a.delay - b.delay);
        const base = keepersByZone[z].length;
        const spawnsHere = spawnZones.filter((s) => s === z).length;
        const free = Array.from({ length: arrivals.length + spawnsHere }, (_, i) => base + i);
        const fromSide = (t: Trip) => dirBetween(z, t.from);
        if (arrivals.length) {
          const side = fromSide(arrivals[0]);
          free.sort((a, b) => {
            const oa = slotOffset(a);
            const ob = slotOffset(b);
            return ob.x * side.x + ob.y * side.y - (oa.x * side.x + oa.y * side.y);
          });
        }
        arrivals.forEach((t, i) => {
          launch(
            t.dot,
            {
              zone: z,
              slot: free[i],
              delay: t.delay,
              dur: TRAVEL_MS + Math.random() * TRAVEL_JITTER_MS,
              arc: ARC_MIN + Math.random() * ARC_RANGE,
            },
            now,
          );
        });
        // Spawned dots fade in at the remaining slots.
        free.slice(arrivals.length).forEach((slot) => {
          const d = dots.find((x) => x.zone === -1 && x.opacity < 0.01 && x.start + x.dur < now);
          if (!d) return;
          d.zone = z;
          d.slot = slot;
          const h = homeOf(d, now);
          d.x = h.x;
          d.y = h.y;
          d.color = [...ZONE_RGB[z]];
          d.zone = -1;
          launch(d, { zone: z, slot, delay: 700, dur: 900, arc: 0 }, now);
          d.prevZone = -1;
        });
      }
    };

    // Initial placement: frame 1, no animation.
    {
      const now = performance.now();
      let i = 0;
      FRAME_COUNTS[0].forEach((count, z) => {
        for (let k = 0; k < count; k++) {
          const d = dots[i++];
          d.zone = z;
          d.prevZone = z;
          d.slot = k;
          const h = homeOf(d, now);
          d.x = d.fromX = h.x;
          d.y = d.fromY = h.y;
          d.color = [...ZONE_RGB[z]];
          d.fromColor = [...ZONE_RGB[z]];
          d.opacity = d.fromOpacity = d.toOpacity = 1;
          d.start = 0;
          d.dur = 1;
        }
      });
    }

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const L = layoutRef.current;
      const live = ZONE_ORDER.map(() => 0);

      dots.forEach((d, i) => {
        const el = circleRefs.current[i];
        const t = d.start > now ? 0 : Math.min(1, (now - d.start) / d.dur);
        const e = easeOutCubic(t);
        const home = homeOf(d, now);

        if (t >= 1) {
          d.x = home.x;
          d.y = home.y;
          d.prevZone = d.zone;
        } else {
          // Quadratic curve; control point pushed sideways so forward trips arc one way
          // and backward trips arc the other.
          const dx = home.x - d.fromX;
          const dy = home.y - d.fromY;
          const len = Math.hypot(dx, dy) || 1;
          const cx = (d.fromX + home.x) / 2 + (dy / len) * d.arc;
          const cy = (d.fromY + home.y) / 2 + (-dx / len) * d.arc;
          const u = 1 - e;
          d.x = u * u * d.fromX + 2 * u * e * cx + e * e * home.x;
          d.y = u * u * d.fromY + 2 * u * e * cy + e * e * home.y;
        }

        const toColor = d.zone >= 0 ? ZONE_RGB[d.zone] : d.fromColor;
        d.color = [0, 1, 2].map((k) =>
          Math.round(d.fromColor[k] + (toColor[k] - d.fromColor[k]) * e),
        ) as RGB;
        d.opacity = d.fromOpacity + (d.toOpacity - d.fromOpacity) * e;

        const counted = t < 0.5 ? d.prevZone : d.zone;
        if (counted >= 0 && d.opacity > 0.01) live[counted]++;

        if (el) {
          el.setAttribute("cx", d.x.toFixed(2));
          el.setAttribute("cy", d.y.toFixed(2));
          el.setAttribute("fill", `rgb(${d.color[0]},${d.color[1]},${d.color[2]})`);
          el.setAttribute("opacity", d.opacity.toFixed(3));
        }
      });

      ZONE_ORDER.forEach((_, z) => {
        const target = Math.max(16, clusterRadius(live[z]) + 10);
        discR[z] += (target - discR[z]) * 0.06;
        const disc = discRefs.current[z];
        if (disc) {
          const b = bob(z, now);
          disc.setAttribute("cx", (L.centers[z].x + b.x).toFixed(2));
          disc.setAttribute("cy", (L.centers[z].y + b.y).toFixed(2));
          disc.setAttribute("r", discR[z].toFixed(2));
          disc.setAttribute("data-empty", live[z] === 0 ? "true" : "false");
        }
        const label = labelRefs.current[z];
        if (label && shownCounts[z] !== live[z]) {
          shownCounts[z] = live[z];
          label.textContent = String(live[z]);
        }
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    let current = 0;
    const steps = FRAME_COUNTS.length - 1;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: stage,
        pin: true,
        start: "top top",
        end: () => `+=${steps * stepVh * 0.01 * window.innerHeight}`,
        anticipatePin: 1,
        onUpdate: (self) => {
          const idx = Math.round(self.progress * steps);
          if (idx !== current) {
            current = idx;
            setStep(idx);
            goTo(FRAME_COUNTS[idx]);
          }
        },
      });
    }, section);

    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, [stepVh]);

  return (
    <div ref={sectionRef} className={className}>
      <div ref={stageRef} className="cluster-stage">
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          role="img"
          aria-label="Scroll-driven chart of dots floating between five colored stages"
          className={vertical ? "cluster-svg is-vertical" : "cluster-svg"}
        >
          <g>
            {ZONE_ORDER.map((z, i) => (
              <circle
                key={`disc-${z}`}
                ref={(el) => {
                  discRefs.current[i] = el;
                }}
                className="cluster-disc"
                cx={layout.centers[i].x}
                cy={layout.centers[i].y}
                r={16}
                fill={ZONE_COLORS[i]}
                stroke={ZONE_COLORS[i]}
              />
            ))}
          </g>
          <g>
            {Array.from({ length: POOL }, (_, i) => (
              <circle
                key={i}
                ref={(el) => {
                  circleRefs.current[i] = el;
                }}
                r={DOT_R}
                opacity={0}
              />
            ))}
          </g>
          <g>
            {ZONE_ORDER.map((z, i) => (
              <text
                key={`label-${z}`}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                x={layout.labels[i].x}
                y={layout.labels[i].y}
                textAnchor={vertical ? "start" : "middle"}
                className="cluster-label"
                fill={ZONE_COLORS[i]}
              >
                {FRAME_COUNTS[0][i]}
              </text>
            ))}
          </g>
        </svg>
        <div className="cluster-steps" aria-label={`Step ${step + 1} of ${FRAME_COUNTS.length}`}>
          {FRAME_COUNTS.map((_, i) => (
            <span key={i} className={i === step ? "is-active" : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default FloatingClusterFunnel;
