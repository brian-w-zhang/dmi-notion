/**
 * LimeZu Modern Interiors character generator sprite sheet layout.
 *
 * Sheet dimensions: 1792 × 1280 px
 * Frame size:       32 × 64 px  (frameWidth: 32, frameHeight: 64)
 * Grid:             56 columns × 20 rows
 * Frame numbering:  left-to-right, top-to-bottom (Phaser default)
 *
 * Direction order within each row: right → back → left → front
 * "front" = facing toward the screen; "back" = facing away
 */

export type Direction = 'right' | 'back' | 'left' | 'front';

export interface FrameRange {
  start: number;
  end: number;
}

/** Animations that have separate frame ranges per facing direction. */
export interface DirectionalAnimDef {
  type: 'directional';
  row: number;
  frameRate: number;
  /** -1 = loop forever, 0 = play once */
  repeat: number;
  directions: Partial<Record<Direction, FrameRange>>;
  notes?: string;
}

/** Animations with no directional variation (single facing, or no facing). */
export interface SimpleAnimDef {
  type: 'simple';
  row: number;
  frameRate: number;
  repeat: number;
  frames: FrameRange;
  notes?: string;
}

/**
 * Animations composed of named sub-sequences that are played in order
 * (e.g. phone: pull-out → loop → put-away).
 */
export interface SequencedAnimDef {
  type: 'sequenced';
  row: number;
  frameRate: number;
  subAnims: Record<string, FrameRange>;
  notes?: string;
}

export type AnimDef = DirectionalAnimDef | SimpleAnimDef | SequencedAnimDef;

// ---------------------------------------------------------------------------

export const SPRITE_FRAME_WIDTH  = 32;
export const SPRITE_FRAME_HEIGHT = 64;
export const SPRITE_COLS_PER_ROW = 56;

// ---------------------------------------------------------------------------

export const CHARACTER_ANIMATION_DEFS: Record<string, AnimDef> = {

  // Row 0 — idle-simple
  // One static frame per direction. Useful as a fallback/default pose.
  'idle-simple': {
    type: 'directional',
    row: 0,
    frameRate: 1,
    repeat: -1,
    directions: {
      right: { start: 0,  end: 0  },
      back:  { start: 1,  end: 1  },
      left:  { start: 2,  end: 2  },
      front: { start: 3,  end: 3  },
    },
  },

  // Row 1 — idle-full
  // 6-frame breathing/bobbing idle, all 4 directions.
  'idle-full': {
    type: 'directional',
    row: 1,
    frameRate: 6,
    repeat: -1,
    directions: {
      right: { start: 56,  end: 61  },
      back:  { start: 62,  end: 67  },
      left:  { start: 68,  end: 73  },
      front: { start: 74,  end: 79  },
    },
  },

  // Row 2 — walk
  // 6-frame walk cycle, all 4 directions.
  'walk': {
    type: 'directional',
    row: 2,
    frameRate: 8,
    repeat: -1,
    directions: {
      right: { start: 112, end: 117 },
      back:  { start: 118, end: 123 },
      left:  { start: 124, end: 129 },
      front: { start: 130, end: 135 },
    },
  },

  // Row 3 — sleep
  // 6-frame loop. Only the head is drawn (upper half of the 32×64 frame).
  // Frames 174 (empty) and 175–178 (bed placement instructions) are unused.
  'sleep': {
    type: 'simple',
    row: 3,
    frameRate: 4,
    repeat: -1,
    frames: { start: 168, end: 173 },
    notes: 'Head-only frames. Frame 174 empty; 175–178 bed instructions — ignore.',
  },

  // Row 4 — sit-legs
  // Seated pose with legs visible. 2 directions only (right + left).
  'sit-legs': {
    type: 'directional',
    row: 4,
    frameRate: 6,
    repeat: -1,
    directions: {
      right: { start: 224, end: 229 },
      left:  { start: 230, end: 235 },
    },
  },

  // Row 5 — sit-nolegs
  // Seated pose with legs hidden (e.g. behind a desk). 2 directions only.
  'sit-nolegs': {
    type: 'directional',
    row: 5,
    frameRate: 6,
    repeat: -1,
    directions: {
      right: { start: 280, end: 285 },
      left:  { start: 286, end: 291 },
    },
  },

  // Row 6 — phone
  // Front-facing only. Three sub-sequences to chain: pull out → use loop → put away.
  'phone': {
    type: 'sequenced',
    row: 6,
    frameRate: 8,
    subAnims: {
      'pull-out': { start: 336, end: 338 },
      'loop':     { start: 339, end: 344 },
      'put-away': { start: 345, end: 347 },
    },
    notes: 'Front-facing only. Chain: pull-out (once) → loop (repeat -1) → put-away (once).',
  },

  // Row 7 — reading
  // Front-facing only. Two sub-sequences: reading loop and page-flip.
  'reading': {
    type: 'sequenced',
    row: 7,
    frameRate: 6,
    subAnims: {
      'loop':      { start: 392, end: 397 },
      'flip-page': { start: 398, end: 403 },
    },
    notes: 'Front-facing only. Alternate loop ↔ flip-page to simulate reading.',
  },

  // Row 8 — push-cart (character frames only)
  // 6-frame push cycle, all 4 directions.
  // The cart overlay sprites start at frame 472 but use 64×64 px each (2 columns wide)
  // and cannot be loaded with the same spritesheet call — handle separately.
  'push-cart': {
    type: 'directional',
    row: 8,
    frameRate: 8,
    repeat: -1,
    directions: {
      right: { start: 448, end: 453 },
      back:  { start: 454, end: 459 },
      left:  { start: 460, end: 465 },
      front: { start: 466, end: 471 },
    },
    notes: 'Character frames only. Cart overlay (64×64, frames 472+) needs a separate load.',
  },

  // Row 9 — pick-up
  // 12-frame pick-up animation, all 4 directions. Play once.
  'pick-up': {
    type: 'directional',
    row: 9,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 504, end: 515 },
      back:  { start: 516, end: 527 },
      left:  { start: 528, end: 539 },
      front: { start: 540, end: 551 },
    },
  },

  // Row 10 — gift
  // 10-frame gift-giving animation, all 4 directions. Play once.
  'gift': {
    type: 'directional',
    row: 10,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 560, end: 569 },
      back:  { start: 570, end: 579 },
      left:  { start: 580, end: 589 },
      front: { start: 590, end: 599 },
    },
  },

  // Row 11 — lift
  // 14-frame lift animation, all 4 directions. Play once.
  'lift': {
    type: 'directional',
    row: 11,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 616, end: 629 },
      back:  { start: 630, end: 643 },
      left:  { start: 644, end: 657 },
      front: { start: 658, end: 671 },
    },
  },

  // Row 12 — throw
  // 14-frame throw animation, all 4 directions. Play once.
  'throw': {
    type: 'directional',
    row: 12,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 672, end: 685 },
      back:  { start: 686, end: 699 },
      left:  { start: 700, end: 713 },
      front: { start: 714, end: 727 },
    },
  },

  // Row 13 — hit (being hit / flinch)
  // 6-frame hit reaction, all 4 directions. Play once.
  'hit': {
    type: 'directional',
    row: 13,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 728, end: 733 },
      back:  { start: 734, end: 739 },
      left:  { start: 740, end: 745 },
      front: { start: 746, end: 751 },
    },
  },

  // Row 14 — punch
  // 6-frame punch, all 4 directions. Play once.
  'punch': {
    type: 'directional',
    row: 14,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 784, end: 789 },
      back:  { start: 790, end: 795 },
      left:  { start: 796, end: 801 },
      front: { start: 802, end: 807 },
    },
  },

  // Row 15 — stab
  // 6-frame stab, all 4 directions. Play once.
  'stab': {
    type: 'directional',
    row: 15,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 840, end: 845 },
      back:  { start: 846, end: 851 },
      left:  { start: 852, end: 857 },
      front: { start: 858, end: 863 },
    },
  },

  // Row 16 — grab-gun
  // 4-frame draw animation, all 4 directions. Play once, then transition to gun-idle.
  'grab-gun': {
    type: 'directional',
    row: 16,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 896, end: 899 },
      back:  { start: 900, end: 903 },
      left:  { start: 904, end: 907 },
      front: { start: 908, end: 911 },
    },
  },

  // Row 17 — gun-idle
  // 6-frame armed idle, all 4 directions. Loop.
  'gun-idle': {
    type: 'directional',
    row: 17,
    frameRate: 6,
    repeat: -1,
    directions: {
      right: { start: 952,  end: 957  },
      back:  { start: 958,  end: 963  },
      left:  { start: 964,  end: 969  },
      front: { start: 970,  end: 975  },
    },
  },

  // Row 18 — shoot
  // 3-frame shoot, all 4 directions. Play once.
  'shoot': {
    type: 'directional',
    row: 18,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 1008, end: 1010 },
      back:  { start: 1011, end: 1013 },
      left:  { start: 1014, end: 1016 },
      front: { start: 1017, end: 1019 },
    },
  },

  // Row 19 — hurt
  // 3-frame hurt/death reaction, all 4 directions. Play once.
  'hurt': {
    type: 'directional',
    row: 19,
    frameRate: 8,
    repeat: 0,
    directions: {
      right: { start: 1064, end: 1066 },
      back:  { start: 1067, end: 1069 },
      left:  { start: 1070, end: 1072 },
      front: { start: 1073, end: 1075 },
    },
  },

};
