import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  COLS,
  COLORS,
  DOT_R,
  ROWS,
  VIEWBOX,
  colCenterX,
  rowCenterY,
} from "../geometry";
import {
  FRAMES,
  frameCheckpointSlots,
  planAllTransitions,
  type PlannedMove,
  type DotSlot,
} from "../migrationPlanner";

gsap.registerPlugin(ScrollTrigger);

type DotFunnelScrollAnimationProps = {
  scrollHeightVh?: number;
  className?: string;
};

type Particle = {
  el: SVGGElement;
  circle: SVGCircleElement;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setDot(
  p: Particle,
  column: number,
  row: number,
  color: string,
  opacity: number,
) {
  gsap.set(p.el, {
    x: colCenterX(column),
    y: rowCenterY(row),
    opacity,
  });
  p.circle.setAttribute("fill", color);
}

function hideDot(p: Particle) {
  gsap.set(p.el, { opacity: 0, x: -100, y: -100 });
}

/** Opacity of a teleport pair at local progress 0→1 — fade out + fade in in sync. */
function teleportOpacities(local: number, move: PlannedMove) {
  const fade = Math.max(0.08, move.duration);
  const start = Math.min(0.9, Math.max(0, move.delay));
  const end = Math.min(1, start + fade);

  let out = 1;
  let inn = 0;

  if (local <= start) {
    out = 1;
    inn = 0;
  } else if (local >= end) {
    out = 0;
    inn = move.kind === "exit" ? 0 : 1;
  } else {
    const t = (local - start) / (end - start);
    out = 1 - t;
    inn = move.kind === "exit" ? 0 : t;
  }

  return { out, inn };
}

/**
 * Build absolute visible slots for a transition at local progress t∈[0,1].
 * Stayers remain; movers teleport with fades.
 * New cells fill left→right; a color-row must be full (10 / zone width)
 * before any cell on the row above is filled.
 */
function slotsAtTransition(
  fromSlots: DotSlot[],
  moves: PlannedMove[],
  local: number,
): { column: number; row: number; color: string; opacity: number }[] {
  if (local <= 0.001) {
    return fromSlots.map((s) => ({ ...s, opacity: 1 }));
  }

  const movingFrom = new Set(
    moves
      .filter((m) => m.kind !== "spawn")
      .map((m) => `${m.fromColumn}:${m.fromRow}`),
  );

  const result: { column: number; row: number; color: string; opacity: number }[] =
    [];

  // Dots that never leave this transition
  for (const s of fromSlots) {
    if (!movingFrom.has(`${s.column}:${s.row}`)) {
      result.push({ ...s, opacity: 1 });
    }
  }

  for (const move of moves) {
    const { out, inn } = teleportOpacities(local, move);

    if (move.kind !== "spawn" && out > 0.02) {
      result.push({
        column: move.fromColumn,
        row: move.fromRow,
        color: move.fromColor,
        opacity: out,
      });
    }

    if (move.kind !== "exit" && inn > 0.02) {
      result.push({
        column: move.toColumn,
        row: move.toRow,
        color: move.toColor,
        opacity: inn,
      });
    }
  }

  return result;
}

export function DotFunnelScrollAnimation({
  scrollHeightVh = 420,
  className,
}: DotFunnelScrollAnimationProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeLayerRef = useRef<SVGGElement>(null);

  const transitions = useMemo(() => planAllTransitions(), []);
  const frameSlots = useMemo(
    () => FRAMES.map((_, i) => frameCheckpointSlots(i)),
    [],
  );

  useEffect(() => {
    const activeLayer = activeLayerRef.current;
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!activeLayer || !section || !stage) return;

    const reduced = prefersReducedMotion();
    const particles: Particle[] = [];
    const poolSize = 240;

    for (let i = 0; i < poolSize; i++) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", String(DOT_R));
      c.setAttribute("cx", "0");
      c.setAttribute("cy", "0");
      g.appendChild(c);
      activeLayer.appendChild(g);
      hideDot({ el: g, circle: c });
      particles.push({ el: g, circle: c });
    }

    const paint = (
      slots: { column: number; row: number; color: string; opacity: number }[],
    ) => {
      particles.forEach((p, i) => {
        if (i < slots.length) {
          const s = slots[i];
          setDot(p, s.column, s.row, s.color, s.opacity);
        } else {
          hideDot(p);
        }
      });
    };

    const renderProgress = (progress: number) => {
      const segs = transitions.length;
      if (reduced) {
        const idx = Math.min(
          FRAMES.length - 1,
          Math.round(progress * (FRAMES.length - 1)),
        );
        paint(frameSlots[idx].map((s) => ({ ...s, opacity: 1 })));
        return;
      }

      if (progress <= 0) {
        paint(frameSlots[0].map((s) => ({ ...s, opacity: 1 })));
        return;
      }
      if (progress >= 1) {
        paint(frameSlots[FRAMES.length - 1].map((s) => ({ ...s, opacity: 1 })));
        return;
      }

      const scaled = progress * segs;
      const seg = Math.min(segs - 1, Math.floor(scaled));
      const local = scaled - seg;

      // Snap exactly to checkpoints
      if (local < 0.02) {
        paint(frameSlots[seg].map((s) => ({ ...s, opacity: 1 })));
        return;
      }
      if (local > 0.98) {
        paint(frameSlots[seg + 1].map((s) => ({ ...s, opacity: 1 })));
        return;
      }

      paint(
        slotsAtTransition(frameSlots[seg], transitions[seg].moves, local),
      );
    };

    paint(frameSlots[0].map((s) => ({ ...s, opacity: 1 })));

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: stage,
        pin: true,
        scrub: 0.45,
        start: "top top",
        end: () => `+=${scrollHeightVh * 0.01 * window.innerHeight}`,
        anticipatePin: 1,
        onUpdate: (self) => renderProgress(self.progress),
        onRefresh: (self) => renderProgress(self.progress),
      });
    }, section);

    return () => {
      ctx.revert();
      particles.forEach((p) => p.el.remove());
    };
  }, [transitions, frameSlots, scrollHeightVh]);

  const bgDots = useMemo(() => {
    const dots: {
      key: string;
      x: number;
      y: number;
      fill: string;
      opacity?: number;
    }[] = [];
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const fill = row >= 8 ? COLORS.bgSecondary : COLORS.bgPrimary;
        dots.push({
          key: `bg-${col}-${row}`,
          x: colCenterX(col),
          y: rowCenterY(row),
          fill,
          opacity: fill === COLORS.bgPrimary ? 0.5 : 1,
        });
      }
    }
    return dots;
  }, []);

  return (
    <div ref={sectionRef} className={className}>
      <div
        ref={stageRef}
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 6vw",
          boxSizing: "border-box",
        }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          role="img"
          aria-label="Scroll-driven dot funnel chart"
          style={{
            width: "100%",
            maxWidth: 920,
            height: "auto",
            overflow: "visible",
          }}
        >
          <g className="bg-grid">
            {bgDots.map((d) => (
              <circle
                key={d.key}
                cx={d.x}
                cy={d.y}
                r={DOT_R}
                fill={d.fill}
                fillOpacity={d.opacity}
              />
            ))}
          </g>

          <g ref={activeLayerRef} className="active-dots" />
        </svg>
      </div>
    </div>
  );
}

export default DotFunnelScrollAnimation;
