import framesData from "./data/frames_data.json";
import {
  ROWS,
  ZONES,
  colorForColumn,
  stackRow,
  zoneForColumn,
  zoneRowWidth,
  type ZoneId,
} from "./geometry";

export type ColumnData = { height: number; colors: string[] };
export type FrameData = Record<string, ColumnData>;
export type FramesMap = Record<string, FrameData>;

export type DotSlot = {
  column: number;
  row: number;
  color: string;
};

export type PlannedMove = {
  id: string;
  fromColumn: number;
  fromRow: number;
  toColumn: number;
  toRow: number;
  fromColor: string;
  toColor: string;
  kind: "stay" | "move" | "spawn" | "exit";
  backward: boolean;
  delay: number;
  duration: number;
  hop: number;
  /** Complete-row LTR fill index within a color zone. */
  fillOrder: number;
};

export type TransitionPlan = {
  fromFrame: number;
  toFrame: number;
  moves: PlannedMove[];
};

/** Pack each zone left-heavy so incomplete top rows fill L→R without gaps. */
function normalizeZoneOrder(frame: FrameData): FrameData {
  const result: FrameData = { ...frame };
  const zoneIds: ZoneId[] = ["A", "B", "C", "D"];
  for (const zoneId of zoneIds) {
    const [lo, hi] = ZONES[zoneId].cols;
    const cols: number[] = [];
    for (let c = lo; c <= hi; c++) cols.push(c);
    const entries = cols.map(
      (c) => frame[String(c)] ?? { height: 0, colors: [ZONES[zoneId].color] },
    );
    const sorted = [...entries].sort((a, b) => b.height - a.height);
    cols.forEach((c, i) => {
      const entry = sorted[i];
      if (entry.height > 0) {
        result[String(c)] = {
          height: entry.height,
          colors: entry.colors.length ? entry.colors : [ZONES[zoneId].color],
        };
      } else {
        delete result[String(c)];
      }
    });
  }
  return result;
}

export const FRAMES: FrameData[] = Object.keys(framesData)
  .filter((k) => /^frame\d+$/.test(k))
  .sort(
    (a, b) =>
      Number(a.replace("frame", "")) - Number(b.replace("frame", "")),
  )
  .map((k) => framesData[k as keyof typeof framesData] as FrameData)
  .map((f) => normalizeZoneOrder(f));

export function slotsFromFrame(frame: FrameData): DotSlot[] {
  const slots: DotSlot[] = [];
  for (const [colStr, data] of Object.entries(frame)) {
    const col = Number(colStr);
    if (col === 6) continue;
    const color = data.colors[0] ?? colorForColumn(col);
    for (let h = 1; h <= data.height; h++) {
      slots.push({ column: col, row: stackRow(h), color });
    }
  }
  return slots;
}

function columnHeights(frame: FrameData): Map<number, number> {
  const map = new Map<number, number>();
  for (const [colStr, data] of Object.entries(frame)) {
    map.set(Number(colStr), data.height);
  }
  return map;
}

type FillTarget = {
  column: number;
  row: number;
  color: string;
  fillOrder: number;
};

/**
 * Fill empty (grey) cells left → right on a row. A row is full when
 * `zoneRowWidth` circles of that color are filled (10 for A/B/C, 8 for D).
 * Only then may the row above begin — never skip an incomplete row.
 */
function assignCompleteRowFillOrder(
  targets: FillTarget[],
  fromFrame: FrameData,
): void {
  if (targets.length === 0) return;

  const byZone = new Map<ZoneId | "other", FillTarget[]>();
  for (const t of targets) {
    const z = zoneForColumn(t.column) ?? "other";
    const list = byZone.get(z) ?? [];
    list.push(t);
    byZone.set(z, list);
  }

  let globalOrder = 0;

  for (const [zoneKey, zoneTargets] of byZone) {
    const remaining = new Set(zoneTargets);
    const colored = new Set<string>();
    const zoneId = zoneKey === "other" ? null : zoneKey;
    const [colLo, colHi] = zoneId
      ? ZONES[zoneId].cols
      : [
          Math.min(...zoneTargets.map((t) => t.column)),
          Math.max(...zoneTargets.map((t) => t.column)),
        ];
    const fullCount = zoneId ? zoneRowWidth(zoneId) : colHi - colLo + 1;

    for (const [colStr, data] of Object.entries(fromFrame)) {
      const col = Number(colStr);
      if (col < colLo || col > colHi) continue;
      for (let h = 1; h <= data.height; h++) {
        colored.add(`${col}:${stackRow(h)}`);
      }
    }

    const countOnRow = (row: number) => {
      let n = 0;
      for (let c = colLo; c <= colHi; c++) {
        if (colored.has(`${c}:${row}`)) n++;
      }
      return n;
    };

    while (remaining.size > 0) {
      let chosen: FillTarget | null = null;

      for (let row = ROWS - 1; row >= 0; row--) {
        const onThisRow = [...remaining]
          .filter((t) => t.row === row)
          .sort((a, b) => a.column - b.column);

        if (onThisRow.length === 0) continue;

        let belowOk = true;
        for (let below = ROWS - 1; below > row; below--) {
          if (countOnRow(below) < fullCount) {
            belowOk = false;
            break;
          }
        }
        if (!belowOk) continue;

        chosen = onThisRow[0];
        break;
      }

      if (!chosen) {
        chosen = [...remaining].sort(
          (a, b) => b.row - a.row || a.column - b.column,
        )[0];
      }

      chosen.fillOrder = globalOrder++;
      remaining.delete(chosen);
      colored.add(`${chosen.column}:${chosen.row}`);
    }
  }

  targets.sort((a, b) => a.fillOrder - b.fillOrder);
}

/**
 * Match source → target slots.
 * Sources leave from the top of each stack; destinations fill grey cells
 * left→right, completing a full color-row before the row above.
 */
export function planTransition(
  fromFrame: FrameData,
  toFrame: FrameData,
  fromIndex: number,
): PlannedMove[] {
  const fromHeights = columnHeights(fromFrame);
  const toHeights = columnHeights(toFrame);

  const allCols = new Set([...fromHeights.keys(), ...toHeights.keys()]);
  const losses = new Map<number, number>();
  const gains = new Map<number, number>();

  for (const col of allCols) {
    if (col === 0) continue;
    const delta = (toHeights.get(col) ?? 0) - (fromHeights.get(col) ?? 0);
    if (delta < 0) losses.set(col, -delta);
    if (delta > 0) gains.set(col, delta);
  }

  const zoneOrder: ZoneId[] = ["seed", "A", "B", "C", "D"];
  const zoneNet = new Map<ZoneId, number>();
  for (const z of zoneOrder) zoneNet.set(z, 0);

  for (const col of allCols) {
    if (col === 0) continue;
    const z = zoneForColumn(col);
    if (!z) continue;
    const delta = (toHeights.get(col) ?? 0) - (fromHeights.get(col) ?? 0);
    zoneNet.set(z, (zoneNet.get(z) ?? 0) + delta);
  }
  const seedFrom =
    (fromHeights.get(0) ?? 0) + (fromHeights.get(1) ?? 0);
  const seedTo = (toHeights.get(0) ?? 0) + (toHeights.get(1) ?? 0);
  zoneNet.set("seed", seedTo - seedFrom);

  const backwardBudget = new Map<number, number>();
  for (const [col, lost] of losses) {
    const z = zoneForColumn(col);
    let back = lost >= 2 ? Math.floor(lost / 2) : 0;
    if (z) {
      const zi = zoneOrder.indexOf(z);
      let prevGains = 0;
      for (let i = 0; i < zi; i++) {
        prevGains += Math.max(0, zoneNet.get(zoneOrder[i]) ?? 0);
      }
      const spice = ((fromIndex * 17 + col * 13) % 5) / 5;
      const wantBack = Math.min(
        lost,
        Math.max(back, Math.floor(prevGains * (0.35 + spice * 0.35))),
      );
      back = Math.min(wantBack, Math.max(1, Math.floor(lost * 0.45)));
      if (prevGains <= 0) back = lost >= 2 ? Math.floor(lost / 2) : 0;
    }
    if (back > 0) backwardBudget.set(col, back);
  }

  type Loose = {
    column: number;
    row: number;
    color: string;
    preferBack: boolean;
    leaveOrder: number;
  };
  const sources: Loose[] = [];
  for (const [col, lost] of [...losses.entries()].sort((a, b) => a[0] - b[0])) {
    const height = fromHeights.get(col) ?? 0;
    const color = fromFrame[String(col)]?.colors[0] ?? colorForColumn(col);
    let backLeft = backwardBudget.get(col) ?? 0;
    for (let i = 0; i < lost; i++) {
      const row = stackRow(height - i);
      const preferBack = backLeft > 0;
      if (preferBack) backLeft--;
      sources.push({
        column: col,
        row,
        color,
        preferBack,
        leaveOrder: i,
      });
    }
  }

  type Target = FillTarget;
  const targets: Target[] = [];
  for (const [col, gained] of [...gains.entries()].sort((a, b) => a[0] - b[0])) {
    const startH = fromHeights.get(col) ?? 0;
    const color = toFrame[String(col)]?.colors[0] ?? colorForColumn(col);
    for (let i = 0; i < gained; i++) {
      const heightFromBottom = startH + 1 + i;
      targets.push({
        column: col,
        row: stackRow(heightFromBottom),
        color,
        fillOrder: 0,
      });
    }
  }

  assignCompleteRowFillOrder(targets, fromFrame);

  const moves: PlannedMove[] = [];
  let moveId = 0;

  const cost = (src: Loose, tgt: Target): number => {
    const dx = tgt.column - src.column;
    let c = Math.abs(dx) * 10 + Math.abs(tgt.row - src.row);
    c += src.row * 100000; // always drain the topmost filled row before any row below it
    c -= src.column * 100; // within that same row, drain the rightmost circle first

    const zs = zoneForColumn(src.column);
    const zt = zoneForColumn(tgt.column);
    const zi = zs ? zoneOrder.indexOf(zs) : -1;
    const zj = zt ? zoneOrder.indexOf(zt) : -1;
    const zoneDelta = zi >= 0 && zj >= 0 ? zj - zi : 0;

    if (zoneDelta > 0) c -= 4;
    if (zoneDelta < 0) c += src.preferBack ? -8 : 22;
    if (dx > 0) c -= 2;
    if (dx < 0 && !src.preferBack) c += 8;
    if (dx === 0) c += 4;
    if (zs && zt && zs !== zt) c += Math.abs(zoneDelta) * 2;
    if (src.preferBack && zoneDelta < 0) c -= 6;
    return c;
  };

  const targetOrder = [...targets.keys()].sort(
    (i, j) => targets[i].fillOrder - targets[j].fillOrder,
  );

  sources.sort((a, b) => {
    if (a.preferBack !== b.preferBack) return a.preferBack ? -1 : 1;
    return a.column - b.column || a.leaveOrder - b.leaveOrder;
  });

  const pendingSources = [...sources];
  const totalSlots = Math.max(targets.length, sources.length, 1);
  const step = 0.82 / totalSlots;
  const fadeDur = Math.min(0.14, step * 0.85);

  const timingFor = (seq: number, backward: boolean) => ({
    delay: seq * step + (backward ? step * 0.15 : 0),
    duration: fadeDur,
    hop: 0,
  });

  for (const tIdx of targetOrder) {
    const tgt = targets[tIdx];
    const zt = zoneForColumn(tgt.column);
    const zj = zt ? zoneOrder.indexOf(zt) : -1;

    // Only same-zone or one-zone-adjacent sources may fill this target —
    // colors never skip a level (e.g. navy can only come from orange or
    // light blue, never directly from blue or green).
    let bestSrc = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let s = 0; s < pendingSources.length; s++) {
      const candidate = pendingSources[s];
      const zs = zoneForColumn(candidate.column);
      const zi = zs ? zoneOrder.indexOf(zs) : -1;
      const zoneDelta = zi >= 0 && zj >= 0 ? zj - zi : 0;
      if (Math.abs(zoneDelta) > 1) continue;
      const c = cost(candidate, tgt);
      if (c < bestCost) {
        bestCost = c;
        bestSrc = s;
      }
    }

    if (bestSrc === -1) {
      // No valid same/adjacent-zone source available — spawn a fresh dot.
      const zone = zt;
      const spawnCol =
        zone === "D"
          ? 39
          : zone === "C"
            ? 29
            : zone === "B"
              ? 19
              : zone === "A"
                ? 9
                : Math.max(0, tgt.column - 3);
      const spawnColor =
        zone === "D"
          ? colorForColumn(39)
          : zone === "C"
            ? colorForColumn(29)
            : zone === "B"
              ? colorForColumn(19)
              : colorForColumn(spawnCol);
      const { delay, duration, hop } = timingFor(tgt.fillOrder, false);
      moves.push({
        id: `t${fromIndex}-s${moveId++}`,
        fromColumn: spawnCol,
        fromRow: stackRow(1),
        toColumn: tgt.column,
        toRow: tgt.row,
        fromColor: spawnColor,
        toColor: tgt.color,
        kind: "spawn",
        backward: false,
        delay,
        duration,
        hop,
        fillOrder: tgt.fillOrder,
      });
      continue;
    }

    const src = pendingSources.splice(bestSrc, 1)[0];
    const backward = tgt.column < src.column;
    const { delay, duration, hop } = timingFor(tgt.fillOrder, backward);
    moves.push({
      id: `t${fromIndex}-m${moveId++}`,
      fromColumn: src.column,
      fromRow: src.row,
      toColumn: tgt.column,
      toRow: tgt.row,
      fromColor: src.color,
      toColor: tgt.color,
      kind: "move",
      backward,
      delay,
      duration,
      hop,
      fillOrder: tgt.fillOrder,
    });
  }

  let exitSeq = targets.length;
  for (const src of pendingSources) {
    const { delay, duration, hop } = timingFor(exitSeq++, false);
    moves.push({
      id: `t${fromIndex}-x${moveId++}`,
      fromColumn: src.column,
      fromRow: src.row,
      toColumn: Math.min(49, src.column + 3),
      toRow: src.row,
      fromColor: src.color,
      toColor: src.color,
      kind: "exit",
      backward: false,
      delay,
      duration,
      hop,
      fillOrder: exitSeq,
    });
  }

  moves.sort((a, b) => a.fillOrder - b.fillOrder || a.delay - b.delay);
  return moves;
}

export function planAllTransitions(): TransitionPlan[] {
  const plans: TransitionPlan[] = [];
  for (let i = 0; i < FRAMES.length - 1; i++) {
    plans.push({
      fromFrame: i,
      toFrame: i + 1,
      moves: planTransition(FRAMES[i], FRAMES[i + 1], i),
    });
  }
  return plans;
}

export function maxActiveDotCount(): number {
  return Math.max(...FRAMES.map((f) => slotsFromFrame(f).length));
}

export function frameCheckpointSlots(frameIndex: number): DotSlot[] {
  return slotsFromFrame(FRAMES[frameIndex]);
}

export { framesData };