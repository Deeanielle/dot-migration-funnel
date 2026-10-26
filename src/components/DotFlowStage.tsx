import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FRAME_COUNTS, MAX_DOTS, ZONE_COLORS, ZONE_ORDER } from "../clusterModel";

gsap.registerPlugin(ScrollTrigger);

/**
 * Shared motion engine for the Staircase, Tubes and Trails versions.
 * Each version supplies a layout (where dots rest and how they travel)
 * and a feel (timing, bounce, tails). The engine handles which dots move,
 * colour swaps, scroll steps and drawing.
 */

export type Pt = { x: number; y: number };

export type FlowLayout = {
  w: number;
  h: number;
  dotR: number;
  /** Resting position of a dot in a stage. */
  slotPos: (zone: number, slot: number) => Pt;
  /** Which stage a point is physically inside (drives the colour swap), or -1. */
  zoneAt: (p: Pt) => number;
  /** Position along the travel path at eased progress e (0 to 1). */
  path: (from: Pt, to: Pt, e: number, arc: number, backward: boolean) => Pt;
  /** "top" = leave from the top of a stack, "rim" = leave from the edge facing the destination. */
  leaveFrom: "top" | "rim";
  center: (zone: number) => Pt;
};

export type FlowFeel = {
  travelMs: number;
  travelJitterMs: number;
  dotStaggerMs: number;
  stageStaggerMs: number;
  backwardDelayMs: number;
  arcMin: number;
  arcRange: number;
  wiggle: number;
  /** Height of the little bounce when a dot lands. 0 = none. */
  bounce: number;
  ease: (t: number) => number;
  /** How quickly a dot changes colour after crossing into a new stage (0 to 1). */
  colorSwap: number;
  /** Length of the tail behind a moving dot, in ms. 0 = no tails. */
  trailMs: number;
  trailOpacity: number;
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const POOL = MAX_DOTS + 6;
const TRAIL_POINTS = 28;

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ZONE_RGB = ZONE_COLORS.map(hexToRgb);

type Dot = {
  zone: number;
  prevZone: number;
  slot: number;
  fromX: number;
  fromY: number;
  fromOpacity: number;
  toOpacity: number;
  start: number;
  dur: number;
  arc: number;
  backward: boolean;
  bouncy: boolean;
  phase: number;
  freqX: number;
  freqY: number;
  x: number;
  y: number;
  color: RGB;
  opacity: number;
  trail: { x: number; y: number; t: number }[];
};

type Props = {
  desktop: FlowLayout;
  mobile: FlowLayout;
  feel: FlowFeel;
  stepVh?: number;
  ariaLabel: string;
  cardClassName?: string;
  background: (layout: FlowLayout, vertical: boolean) => ReactNode;
  foreground?: (layout: FlowLayout, vertical: boolean) => ReactNode;
  /** Called every frame with the live count per stage. */
  onTick?: (live: number[]) => void;
};

export function DotFlowStage({
  desktop,
  mobile,
  feel,
  stepVh = 70,
  ariaLabel,
  cardClassName = "flow-card",
  background,
  foreground,
  onTick,
}: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const trailRefs = useRef<(SVGPathElement | null)[]>([]);
  const trailGradRefs = useRef<(SVGLinearGradientElement | null)[]>([]);
  const trailStopRefs = useRef<(SVGStopElement | null)[]>([]);

  const [vertical, setVertical] = useState(
    () => window.matchMedia("(max-width: 640px)").matches,
  );
  const [step, setStep] = useState(0);
  const layout = vertical ? mobile : desktop;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

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

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wiggle = reduced ? 0 : feel.wiggle;
    const L = () => layoutRef.current;

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
      backward: false,
      bouncy: false,
      phase: (i * 2.399) % (Math.PI * 2),
      freqX: 0.0009 + ((i * 37) % 10) * 0.00007,
      freqY: 0.0011 + ((i * 53) % 10) * 0.00006,
      x: 0,
      y: 0,
      color: [200, 200, 200],
      opacity: 0,
      trail: [],
    }));

    const homeOf = (d: Dot, now: number): Pt => {
      if (d.zone < 0) return { x: d.fromX, y: d.fromY };
      const p = L().slotPos(d.zone, d.slot);
      return {
        x: p.x + Math.sin(now * d.freqX + d.phase) * wiggle,
        y: p.y + Math.cos(now * d.freqY + d.phase * 1.3) * wiggle,
      };
    };

    const launch = (
      d: Dot,
      o: {
        zone: number;
        slot: number;
        delay: number;
        dur: number;
        arc: number;
        backward?: boolean;
        bouncy?: boolean;
        toOpacity?: number;
      },
      now: number,
    ) => {
      d.prevZone = d.zone;
      d.fromX = d.x;
      d.fromY = d.y;
      d.fromOpacity = d.opacity;
      d.zone = o.zone;
      d.slot = o.slot;
      d.start = now + (reduced ? 0 : o.delay);
      d.dur = reduced ? 1 : o.dur;
      d.arc = reduced ? 0 : o.arc;
      d.backward = !!o.backward;
      d.bouncy = !reduced && !!o.bouncy;
      d.toOpacity = o.toOpacity ?? 1;
    };

    const membersOf = (z: number) =>
      dots.filter((d) => d.zone === z).sort((a, b) => a.slot - b.slot);

    const dirBetween = (a: number, b: number): Pt => {
      const ca = L().center(a);
      const cb = L().center(b);
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };

    const offsetOf = (z: number, slot: number): Pt => {
      const p = L().slotPos(z, slot);
      const c = L().center(z);
      return { x: p.x - c.x, y: p.y - c.y };
    };

    const pickLeavers = (list: Dot[], n: number, z: number, toward: Pt): Dot[] => {
      if (n <= 0) return [];
      if (L().leaveFrom === "top") return list.slice(-n).reverse();
      return list
        .slice(-Math.max(n * 3, 8))
        .map((d) => {
          const o = offsetOf(z, d.slot);
          return { d, score: o.x * toward.x + o.y * toward.y };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, n)
        .map((s) => s.d);
    };

    const goTo = (target: number[]) => {
      const now = performance.now();
      const n = ZONE_ORDER.length;
      const lists = ZONE_ORDER.map((_, z) => membersOf(z));

      // 1. Balance totals if two frames have a different number of dots.
      const counts = lists.map((l) => l.length);
      const eff = [...target];
      let diff = target.reduce((a, b) => a + b, 0) - counts.reduce((a, b) => a + b, 0);
      const spawnZones: number[] = [];
      while (diff > 0) {
        let best = 0;
        for (let z = 1; z < n; z++) if (eff[z] - counts[z] > eff[best] - counts[best]) best = z;
        spawnZones.push(best);
        eff[best] -= 1;
        diff--;
      }
      while (diff < 0) {
        let best = 0;
        for (let z = 1; z < n; z++) if (eff[z] - counts[z] < eff[best] - counts[best]) best = z;
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
          z < n - 1 ? pickLeavers(list, Math.min(fwd, list.length), z, dirBetween(z, z + 1)) : [];
        fwdDots.forEach((d) => leaving.add(d));
        const rest = list.filter((d) => !leaving.has(d));
        const backDots =
          z > 0 ? pickLeavers(rest, Math.min(back, rest.length), z, dirBetween(z, z - 1)) : [];
        backDots.forEach((d) => leaving.add(d));
        fwdDots.forEach((dot, j) =>
          trips.push({
            dot,
            from: z,
            to: z + 1,
            delay: z * feel.stageStaggerMs + j * feel.dotStaggerMs + Math.random() * 90,
          }),
        );
        backDots.forEach((dot, j) =>
          trips.push({
            dot,
            from: z,
            to: z - 1,
            delay:
              feel.backwardDelayMs +
              z * feel.stageStaggerMs +
              j * feel.dotStaggerMs * 1.6 +
              Math.random() * 120,
          }),
        );
      }

      // 3. Dots that stay close any gaps.
      const keepers = lists.map((l) => l.filter((d) => !leaving.has(d) && d.zone >= 0));
      keepers.forEach((list, z) =>
        list.forEach((d, i) => {
          if (d.slot !== i)
            launch(d, { zone: z, slot: i, delay: 250 + Math.random() * 300, dur: 1100, arc: 0 }, now);
        }),
      );

      // 4. Arrivals take the next free slots.
      for (let z = 0; z < n; z++) {
        const arrivals = trips.filter((t) => t.to === z).sort((a, b) => a.delay - b.delay);
        const base = keepers[z].length;
        const spawnsHere = spawnZones.filter((s) => s === z).length;
        const free = Array.from({ length: arrivals.length + spawnsHere }, (_, i) => base + i);
        if (arrivals.length && L().leaveFrom === "rim") {
          const side = dirBetween(z, arrivals[0].from);
          free.sort((a, b) => {
            const oa = offsetOf(z, a);
            const ob = offsetOf(z, b);
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
              dur: feel.travelMs + Math.random() * feel.travelJitterMs,
              arc: feel.arcMin + Math.random() * feel.arcRange,
              backward: t.to < t.from,
              bouncy: feel.bounce > 0,
            },
            now,
          ),
        );
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
      const layoutNow = L();

      dots.forEach((d, i) => {
        const t = d.start > now ? 0 : Math.min(1, (now - d.start) / d.dur);
        const e = feel.ease(t);
        const home = homeOf(d, now);
        const moving = t > 0 && t < 1;

        if (t >= 1) {
          d.x = home.x;
          d.y = home.y;
          d.prevZone = d.zone;
          if (d.bouncy) {
            const dt = now - (d.start + d.dur);
            if (dt < 700) {
              d.y -= feel.bounce * Math.abs(Math.sin(dt * 0.02)) * Math.exp(-dt * 0.008);
            } else d.bouncy = false;
          }
        } else if (t > 0 && d.arc > 0) {
          const p = layoutNow.path({ x: d.fromX, y: d.fromY }, home, e, d.arc, d.backward);
          d.x = p.x;
          d.y = p.y;
        } else if (t > 0) {
          d.x = d.fromX + (home.x - d.fromX) * e;
          d.y = d.fromY + (home.y - d.fromY) * e;
        } else {
          d.x = d.fromX;
          d.y = d.fromY;
        }

        const inZone = layoutNow.zoneAt({ x: d.x, y: d.y });
        if (inZone >= 0 && d.zone >= 0) {
          const target = ZONE_RGB[inZone];
          const k = reduced ? 1 : feel.colorSwap;
          d.color = [0, 1, 2].map((c) => d.color[c] + (target[c] - d.color[c]) * k) as RGB;
        }
        d.opacity = d.fromOpacity + (d.toOpacity - d.fromOpacity) * e;

        const counted = t < 0.5 ? d.prevZone : d.zone;
        if (counted >= 0 && d.opacity > 0.01) live[counted]++;

        const fill = `rgb(${Math.round(d.color[0])},${Math.round(d.color[1])},${Math.round(d.color[2])})`;
        const el = circleRefs.current[i];
        if (el) {
          el.setAttribute("cx", d.x.toFixed(2));
          el.setAttribute("cy", d.y.toFixed(2));
          el.setAttribute("fill", fill);
          el.setAttribute("opacity", d.opacity.toFixed(3));
        }

        // Tails: oldest end is faintest and thinnest, the end nearest the dot is strongest.
        if (feel.trailMs > 0 && !reduced) {
          if (moving && d.arc > 0) {
            const last = d.trail[d.trail.length - 1];
            if (!last || Math.hypot(last.x - d.x, last.y - d.y) > 1.5)
              d.trail.push({ x: d.x, y: d.y, t: now });
          }
          while (d.trail.length && now - d.trail[0].t > feel.trailMs) d.trail.shift();
          const path = trailRefs.current[i];
          const grad = trailGradRefs.current[i];
          const all = d.trail.length ? [...d.trail, { x: d.x, y: d.y, t: now }] : [];
          if (path && grad) {
            if (all.length < 3) {
              path.setAttribute("d", "");
            } else {
              // Downsample, then build a ribbon that tapers to nothing at the oldest end.
              const stepN = Math.max(1, Math.ceil(all.length / TRAIL_POINTS));
              const pts = all.filter((_, k) => k % stepN === 0 || k === all.length - 1);
              const n = pts.length;
              const left: string[] = [];
              const right: string[] = [];
              pts.forEach((p, k) => {
                const a = pts[Math.max(0, k - 1)];
                const b = pts[Math.min(n - 1, k + 1)];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const half = layoutNow.dotR * 0.85 * (k / (n - 1));
                const nx = (-dy / len) * half;
                const ny = (dx / len) * half;
                left.push(`${(p.x + nx).toFixed(2)} ${(p.y + ny).toFixed(2)}`);
                right.push(`${(p.x - nx).toFixed(2)} ${(p.y - ny).toFixed(2)}`);
              });
              path.setAttribute("d", `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`);
              const tail = pts[0];
              const head = pts[n - 1];
              grad.setAttribute("x1", tail.x.toFixed(2));
              grad.setAttribute("y1", tail.y.toFixed(2));
              grad.setAttribute("x2", head.x.toFixed(2));
              grad.setAttribute("y2", head.y.toFixed(2));
              const s0 = trailStopRefs.current[i * 2];
              const s1 = trailStopRefs.current[i * 2 + 1];
              s0?.setAttribute("stop-color", fill);
              s1?.setAttribute("stop-color", fill);
              // Whole tail also fades as the dot settles, so it disappears back to front.
              const life = Math.min(1, (now - tail.t) / feel.trailMs);
              s1?.setAttribute("stop-opacity", (feel.trailOpacity * d.opacity * (0.35 + 0.65 * (1 - life * life))).toFixed(3));
            }
          }
        }
      });

      tickRef.current?.(live);
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
  }, [stepVh, feel]);

  return (
    <div ref={sectionRef}>
      <div ref={stageRef} className="flow-stage">
        <div className={vertical ? `${cardClassName} is-vertical` : cardClassName}>
          <svg
            viewBox={`0 0 ${layout.w} ${layout.h}`}
            role="img"
            aria-label={ariaLabel}
            className="flow-svg"
            style={vertical ? { aspectRatio: `${layout.w} / ${layout.h}` } : undefined}
          >
            {background(layout, vertical)}
            {feel.trailMs > 0 && (
              <g>
                <defs>
                  {Array.from({ length: POOL }, (_, i) => (
                    <linearGradient
                      key={i}
                      id={`dot-tail-${i}`}
                      gradientUnits="userSpaceOnUse"
                      ref={(el) => {
                        trailGradRefs.current[i] = el;
                      }}
                    >
                      <stop
                        offset="0%"
                        stopOpacity={0}
                        ref={(el) => {
                          trailStopRefs.current[i * 2] = el;
                        }}
                      />
                      <stop
                        offset="100%"
                        stopOpacity={0}
                        ref={(el) => {
                          trailStopRefs.current[i * 2 + 1] = el;
                        }}
                      />
                    </linearGradient>
                  ))}
                </defs>
                {Array.from({ length: POOL }, (_, i) => (
                  <path
                    key={i}
                    fill={`url(#dot-tail-${i})`}
                    ref={(el) => {
                      trailRefs.current[i] = el;
                    }}
                  />
                ))}
              </g>
            )}
            <g>
              {Array.from({ length: POOL }, (_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    circleRefs.current[i] = el;
                  }}
                  r={layout.dotR}
                  opacity={0}
                />
              ))}
            </g>
            {foreground?.(layout, vertical)}
          </svg>
        </div>
        <div className="cluster-steps" aria-label={`Step ${step + 1} of ${FRAME_COUNTS.length}`}>
          {FRAME_COUNTS.map((_, i) => (
            <span key={i} className={i === step ? "is-active" : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

export { ZONE_COLORS, ZONE_ORDER };
