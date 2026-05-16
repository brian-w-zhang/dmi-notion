/**
 * Car sprite sheet layouts.
 *
 * Two variants exist, differing only in block size:
 *
 *   car_3  →  6×6-tile blocks  (192×192 px),  144 cols × 12 rows = 1728 frames
 *   car_4,
 *   car_5  →  5×5-tile blocks  (160×160 px),  120 cols × 10 rows = 1200 frames
 *
 * Shared structure (both variants):
 *   Super-row 0  (tile rows 0 .. blockTiles-1):   idle  — 1 frame  per direction
 *   Super-row 1  (tile rows blockTiles .. end):    drive — 6 frames per direction
 *
 *   Direction order in super-row 0: right → back → left → front (blocks 0–3)
 *   Direction order in super-row 1:
 *     right  blocks  0– 5
 *     back   blocks  6–11
 *     left   blocks 12–17
 *     front  blocks 18–23
 *
 * Car occupancy within each N×N block (N = blockTiles):
 *   Right / Left:  full width × bottom 3 rows
 *                  size   N*32 × 96 px
 *                  offset (0,  (N-3)*32)
 *   Back  / Front: cols 2–(N-2) × full height    [1-indexed: cols 2 to N-1, omitting 1 and N]
 *                  size   96 × N*32 px
 *                  offset ((N-4)*32, 0)
 *
 * Because frames are non-uniform size, sheets must be loaded as plain images
 * (not spritesheets). CarAnimationRegistry.ts registers pixel-crop frames on
 * the texture and creates Phaser animations from them.
 */

export type CarDirection = 'right' | 'back' | 'left' | 'front';

/** Pixel crop that defines one animation frame within the sheet. */
export interface CarFrameCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CarAnimDef {
  frameRate: number;
  /** -1 = loop forever, 0 = play once */
  repeat: number;
  directions: Record<CarDirection, CarFrameCrop[]>;
}

export interface CarSheetInfo {
  /** Total tile columns in the sheet. */
  cols: number;
  /** Total tile rows in the sheet. */
  rows: number;
  animDefs: Record<string, CarAnimDef>;
}

// ---------------------------------------------------------------------------
// Factory

const TILE = 32;

function makeCarSheetInfo(blockTiles: number): CarSheetInfo {
  const BLOCK      = blockTiles * TILE;
  const SIDE_OFFSET_Y = (blockTiles - 3) * TILE; // bottom 3 rows of block
  const TALL_OFFSET_X = (blockTiles - 4) * TILE; // cols 2–(N-2) of block

  function sideFrames(count: number, baseX: number, baseY: number): CarFrameCrop[] {
    return Array.from({ length: count }, (_, i) => ({
      x: baseX + i * BLOCK,
      y: baseY + SIDE_OFFSET_Y,
      w: BLOCK,
      h: TILE * 3,
    }));
  }

  function tallFrames(count: number, baseX: number, baseY: number): CarFrameCrop[] {
    return Array.from({ length: count }, (_, i) => ({
      x: baseX + i * BLOCK + TALL_OFFSET_X,
      y: baseY,
      w: TILE * 3,
      h: BLOCK,
    }));
  }

  // Base pixel-x for each direction in the animation super-row
  const backBaseX  = blockTiles *  6 * TILE;
  const leftBaseX  = blockTiles * 12 * TILE;
  const frontBaseX = blockTiles * 18 * TILE;

  const animDefs: Record<string, CarAnimDef> = {
    idle: {
      frameRate: 1,
      repeat: -1,
      directions: {
        right: sideFrames(1, BLOCK * 0, 0),
        back:  tallFrames(1, BLOCK * 1, 0),
        left:  sideFrames(1, BLOCK * 2, 0),
        front: tallFrames(1, BLOCK * 3, 0),
      },
    },
    drive: {
      frameRate: 8,
      repeat: -1,
      directions: {
        right: sideFrames(6, 0,          BLOCK),
        back:  tallFrames(6, backBaseX,  BLOCK),
        left:  sideFrames(6, leftBaseX,  BLOCK),
        front: tallFrames(6, frontBaseX, BLOCK),
      },
    },
  };

  return {
    cols:     blockTiles * 24,   // 24 blocks wide (6 anim frames × 4 directions)
    rows:     blockTiles * 2,    // 2 super-rows
    animDefs,
  };
}

// ---------------------------------------------------------------------------
// Exported configs

/** car_3 — 6×6-tile blocks, 144 × 12 tile sheet */
export const CAR_SHEET_6x6 = makeCarSheetInfo(6);

/** car_4, car_5 — 5×5-tile blocks, 120 × 10 tile sheet */
export const CAR_SHEET_5x5 = makeCarSheetInfo(5);
