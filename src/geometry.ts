export const VIEWBOX = { width: 466, height: 101 } as const;
export const COLS = 50;
export const ROWS = 10;
export const DOT_R = 3.6709;
export const COL_PITCH = 9.3418;
export const ROW_PITCH = 10.3416;

export const COLORS = {
  seed: "#F78D29",
  zoneA: "#00205B",
  zoneB: "#5BC2E7",
  zoneC: "#3260A7",
  zoneD: "#84BD00",
  bgPrimary: "#E2E2E2",
  bgSecondary: "#E2E2E2",
} as const;

export type ZoneId = "seed" | "A" | "B" | "C" | "D";

export const ZONES: Record<
  ZoneId,
  { cols: [number, number]; color: string }
> = {
  seed: { cols: [0, 1], color: COLORS.seed },
  A: { cols: [10, 19], color: COLORS.zoneA },
  B: { cols: [20, 29], color: COLORS.zoneB },
  C: { cols: [30, 39], color: COLORS.zoneC },
  D: { cols: [40, 47], color: COLORS.zoneD },
};

/** How many columns make a “full” row of one color in this zone. */
export function zoneRowWidth(zone: ZoneId): number {
  const [a, b] = ZONES[zone].cols;
  return b - a + 1;
}

/** Static decorative connector — unused in current prototype (was reading as stray navy). */
export const DECORATIVE = { column: 6, row: 7, color: COLORS.bgPrimary } as const;

export function colCenterX(i: number): number {
  return DOT_R + i * COL_PITCH;
}

export function rowCenterY(j: number): number {
  return DOT_R + j * ROW_PITCH;
}

/** Bottom-aligned stack: height h occupies rows (ROWS - h) .. (ROWS - 1). */
export function stackRow(heightFromBottom: number): number {
  return ROWS - heightFromBottom;
}

export function zoneForColumn(col: number): ZoneId | null {
  if (col === 0 || col === 1) return "seed";
  if (col >= 10 && col <= 19) return "A";
  if (col >= 20 && col <= 29) return "B";
  if (col >= 30 && col <= 39) return "C";
  if (col >= 40 && col <= 47) return "D";
  return null;
}

export function colorForColumn(col: number): string {
  const zone = zoneForColumn(col);
  if (!zone) return COLORS.bgPrimary;
  return ZONES[zone].color;
}
