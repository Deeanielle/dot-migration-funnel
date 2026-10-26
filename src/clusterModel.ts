import framesData from "./data/frames_data.json";
import { ZONES, zoneForColumn, type ZoneId } from "./geometry";

/** Stages in funnel order, left to right. */
export const ZONE_ORDER: ZoneId[] = ["seed", "A", "B", "C", "D"];
export const ZONE_COLORS: string[] = ZONE_ORDER.map((z) => ZONES[z].color);

type Col = { height: number; colors: string[] };
type Frames = Record<string, Record<string, Col>>;

/** Dot count per stage for every frame, read from the same frames_data.json as the grid version. */
export const FRAME_COUNTS: number[][] = Object.keys(framesData)
  .filter((k) => /^frame\d+$/.test(k))
  .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
  .map((k) => {
    const frame = (framesData as unknown as Frames)[k];
    const counts = ZONE_ORDER.map(() => 0);
    for (const [col, v] of Object.entries(frame)) {
      const zone = zoneForColumn(Number(col));
      if (!zone) continue;
      counts[ZONE_ORDER.indexOf(zone)] += v.height;
    }
    return counts;
  });

export const MAX_DOTS = Math.max(
  ...FRAME_COUNTS.map((c) => c.reduce((a, b) => a + b, 0)),
);
