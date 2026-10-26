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

const DOT_R = 5.5; // dot radius
const SPACING = 11; // how airy each cloud of dots is (bigger = more spread out)
const SCATTER = 2.5; // how irregular the cloud looks (0 = perfect spiral)
const WIGGLE = 1.6; // how far each dot wiggles while resting
const TRAVEL_MS = 1600; // how long one dot takes to float between columns
const TRAVEL_JITTER_MS = 600; // random extra travel time so dots don't move in lockstep
const DOT_STAGGER_MS = 90; // gap between dots leaving the same column
const STAGE_STAGGER_MS = 140; // gap between columns starting their moves (left to right wave)
const BACKWARD_DELAY_MS = 450; // backward moves start a beat after forward moves
const ARC_MIN = 14; // how much the float path curves
const ARC_RANGE = 26;
const COLOR_SWAP = 0.18; // how quickly a dot changes colour after crossing into a new column (0 to 1)

/** Gradient strength per column at its fullest. Blues are stronger on purpose. */
const GRADIENT_MAX = [0.22, 0.34, 0.42, 0.36, 0.26];
const GRADIENT_MIN = 0.06; // strength of an empty column
const FULL_COUNT = 53; // the dot count that reads as a "full" column

/* ------------------------------------------------------------------ */

const POOL = MAX_DOTS + 6;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Layout = { w: number; h: number; vertical: boolean; panels: Rect[] };

const H_LAYOUT: Layout = {
  w: 1000,
  h: 300,
  vertical: false,
  panels: ZONE_ORDER.map((_, i) => ({ x: i * 200, y: 0, w: 200, h: 300 })),
};
const V_LAYOUT: Layout = {
  w: 340,
  h: 1100,
  vertical: true,
  panels: ZONE_ORDER.map((_, i) => ({ x: 0, y: i * 220, w: 340, h: 220 })),
};

const centerOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

type RGB = [number, number, number];
function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const ZONE_RGB = ZONE_COLORS.map(hexToRgb);

/** Loose, organic cloud: a sunflower spiral nudged by a fixed per-slot scatter. */
function slotOffset(k: number): Pt {
  const r = SPACING * Math.sqrt(k + 0.5);
  const a = k * GOLDEN;
  const jx = Math.sin(k * 12.9898) * SCATTER;
  const jy = Math.sin(k * 78.233) * SCATTER;
  return { x: r * Math.cos(a) + jx, y: r * Math.sin(a) + jy };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type Dot = {
  zone: number; // -1 = hidden
  prevZone: number;
  slot: number;
  fromX: number;
  fromY: number;
  fromOpacity: number;
  toOpacity: number;
  start: number;
  dur: number;
  arc: number;
  phase: number;
  freqX: number;
  freqY: number;
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
  const stopRefs = useRef<(SVGStopElement | null)[]>([]);

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
    const wiggle = reduced ? 0 : WIGGLE;

    const dots: Dot[] = Array.from({ length: POOL }, (_, i) => ({
      zone: -1,
      prevZone: -1,
      slot: 0,
      fromX: 0,
      fromY: 0,
      fromOpacity: 0,
      toOpacity: 0,
      start: 0,
      dur: 1,
      arc: 0,
      phase: (i * 2.399) % (Math.PI * 2),
      freqX: 0.0009 + ((i * 37) % 10) * 0.00007,
      freqY: 0.0011 + ((i * 53) % 10) * 0.00006,
      x: 0,
      y: 0,
      color: [200, 200, 200],
      opacity: 0,
    }));

    const gradAlpha = ZONE_ORDER.map(() => GRADIENT_MIN);

    const homeOf = (d: Dot, now: number): Pt => {
      if (d.zone < 0) return { x: d.fromX, y: d.fromY };
      const c = centerOf(layoutRef.current.panels[d.zone]);
      const o = slotOffset(d.slot);
      return {
        x: c.x + o.x + Math.sin(now * d.freqX + d.phase) * wiggle,
        y: c.y + o.y + Math.cos(now * d.freqY + d.phase * 1.3) * wiggle,
      };
    };

    /** Which column a point is physically inside. */
    const zoneAt = (p: Pt): number => {
      const panels = layoutRef.current.panels;
      for (let z = 0; z < panels.length; z++) {
        const r = panels[z];
        if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return z;
      }
      return -1;
    };

    const launch = (
      d: Dot,
      opts: { zone: number; slot: number; delay: number; dur: number; arc: number; toOpacity?: number },
      now: number,
    ) => {
      d.prevZone = d.zone;
      d.fromX = d.x;
      d.fromY = d.y;
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
      const P = layoutRef.current.panels;
      const ca = centerOf(P[a]);
      const cb = centerOf(P[b]);
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };

    /** Pick n dots from the outside of a cloud, on the side facing the destination. */
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

    /** Move dots so each column's count matches `target`. */
    const goTo = (target: number[]) => {
      const now = performance.now();
      const n = ZONE_ORDER.length;
      const lists = ZONE_ORDER.map((_, z) => membersOf(z));

      // 1. Balance totals if two frames have a different number of dots.
      const counts = lists.map((l) => l.length);
      const eff = [...target];
      let diff =
        target.reduce((a, b) => a + b, 0) - counts.reduce((a, b) => a + b, 0);
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
        const fwdDots =
          z < n - 1 ? pickLeavers(list, Math.min(fwd, list.length), dirBetween(z, z + 1)) : [];
        fwdDots.forEach((d) => leaving.add(d));
        const rest = list.filter((d) => !leaving.has(d));
        const backDots =
          z > 0 ? pickLeavers(rest, Math.min(back, rest.length), dirBetween(z, z - 1)) : [];
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
              BACKWARD_DELAY_MS +
              z * STAGE_STAGGER_MS +
              j * DOT_STAGGER_MS * 1.6 +
              Math.random() * 120,
          }),
        );
      }

      // 3. Dots that stay re-pack into the inner slots (a gentle settle).
      const keepersByZone = lists.map((l) =>
        l.filter((d) => !leaving.has(d) && d.zone >= 0),
      );
      keepersByZone.forEach((keepers, z) =>
        keepers.forEach((d, i) => {
          if (d.slot !== i) {
            launch(d, { zone: z, slot: i, delay: 250 + Math.random() * 300, dur: 1200, arc: 0 }, now);
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
        const free = Array.from(
          { length: arrivals.length + spawnsHere },
          (_, i) => base + i,
        );
        if (arrivals.length) {
          const side = dirBetween(z, arrivals[0].from);
          free.sort((a, b) => {
            const oa = slotOffset(a);
            const ob = slotOffset(b);
            return ob.x * side.x + ob.y * side.y - (oa.x * side.x + oa.y * side.y);
          });
        }
        arrivals.forEach((t, i) =>
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
          ),
        );
        free.slice(arrivals.length).forEach((slot) => {
          const d = dots.find(
            (x) => x.zone === -1 && x.opacity < 0.01 && x.start + x.dur < now,
          );
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
          d.zone = d.prevZone = z;
          d.slot = k;
          const h = homeOf(d, now);
          d.x = d.fromX = h.x;
          d.y = d.fromY = h.y;
          d.color = [...ZONE_RGB[z]];
          d.opacity = d.fromOpacity = d.toOpacity = 1;
          d.start = 0;
          d.dur = 1;
        }
      });
    }

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const live = ZONE_ORDER.map(() => 0);

      dots.forEach((d, i) => {
        const t = d.start > now ? 0 : Math.min(1, (now - d.start) / d.dur);
        const e = easeOutCubic(t);
        const home = homeOf(d, now);

        if (t >= 1) {
          d.x = home.x;
          d.y = home.y;
          d.prevZone = d.zone;
        } else {
          // Curved path: forward trips bow one way, backward trips the other.
          const dx = home.x - d.fromX;
          const dy = home.y - d.fromY;
          const len = Math.hypot(dx, dy) || 1;
          const cx = (d.fromX + home.x) / 2 + (dy / len) * d.arc;
          const cy = (d.fromY + home.y) / 2 + (-dx / len) * d.arc;
          const u = 1 - e;
          d.x = u * u * d.fromX + 2 * u * e * cx + e * e * home.x;
          d.y = u * u * d.fromY + 2 * u * e * cy + e * e * home.y;
        }

        // Colour follows whichever column the dot is physically in.
        const inZone = zoneAt({ x: d.x, y: d.y });
        if (inZone >= 0) {
          const target = ZONE_RGB[inZone];
          const k = reduced ? 1 : COLOR_SWAP;
          d.color = [0, 1, 2].map(
            (c) => d.color[c] + (target[c] - d.color[c]) * k,
          ) as RGB;
        }
        d.opacity = d.fromOpacity + (d.toOpacity - d.fromOpacity) * e;

        const counted = t < 0.5 ? d.prevZone : d.zone;
        if (counted >= 0 && d.opacity > 0.01) live[counted]++;

        const el = circleRefs.current[i];
        if (el) {
          el.setAttribute("cx", d.x.toFixed(2));
          el.setAttribute("cy", d.y.toFixed(2));
          el.setAttribute(
            "fill",
            `rgb(${Math.round(d.color[0])},${Math.round(d.color[1])},${Math.round(d.color[2])})`,
          );
          el.setAttribute("opacity", d.opacity.toFixed(3));
        }
      });

      // Column gradients get stronger as a column fills up.
      ZONE_ORDER.forEach((_, z) => {
        const fill = Math.min(1, live[z] / FULL_COUNT);
        const target = GRADIENT_MIN + (GRADIENT_MAX[z] - GRADIENT_MIN) * fill;
        gradAlpha[z] += (target - gradAlpha[z]) * (reduced ? 1 : 0.04);
        stopRefs.current[z]?.setAttribute("stop-opacity", gradAlpha[z].toFixed(3));
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
        <div className={vertical ? "cluster-card is-vertical" : "cluster-card"}>
          <svg
            viewBox={`0 0 ${layout.w} ${layout.h}`}
            role="img"
            aria-label="Scroll-driven chart of dots floating between five colored stages"
            className="cluster-svg"
          >
            <defs>
              {ZONE_ORDER.map((z, i) => (
                <linearGradient
                  key={`g-${z}`}
                  id={`col-grad-${z}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={ZONE_COLORS[i]} stopOpacity={0} />
                  <stop
                    offset="100%"
                    stopColor={ZONE_COLORS[i]}
                    stopOpacity={GRADIENT_MIN}
                    ref={(el) => {
                      stopRefs.current[i] = el;
                    }}
                  />
                </linearGradient>
              ))}
            </defs>

            {layout.panels.map((p, i) => (
              <rect
                key={`panel-${i}`}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                fill={`url(#col-grad-${ZONE_ORDER[i]})`}
              />
            ))}

            {layout.panels.slice(1).map((p, i) =>
              layout.vertical ? (
                <line key={`div-${i}`} x1={0} x2={layout.w} y1={p.y} y2={p.y} className="cluster-divider" />
              ) : (
                <line key={`div-${i}`} x1={p.x} x2={p.x} y1={0} y2={layout.h} className="cluster-divider" />
              ),
            )}

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
          </svg>
        </div>
        <div
          className="cluster-steps"
          aria-label={`Step ${step + 1} of ${FRAME_COUNTS.length}`}
        >
          {FRAME_COUNTS.map((_, i) => (
            <span key={i} className={i === step ? "is-active" : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default FloatingClusterFunnel;
