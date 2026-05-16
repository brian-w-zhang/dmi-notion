export const PLAYER_CHARACTER_ID = 'dwight-schrute';

export const DEFAULT_CAMERA_ZOOM = 0.8;
export const MAX_CAMERA_ZOOM = 5;
export const MIN_CAMERA_ZOOM_EPSILON = 0.0001;
export const MIN_CAMERA_ZOOM_FLOOR = 0.01;
export const CAMERA_WHEEL_ZOOM_SENSITIVITY = 0.001;

export const CHAIR_INTERACTION_RADIUS = 64;
export const APPLIANCE_INTERACTION_RADIUS = 64;
export const CAR_MOUNT_RADIUS = 80;
export const ENTRANCE_INTERACTION_RADIUS = 80;

export const HUD_DEPTH = 9999;
export const HUD_BOTTOM_HINT_OFFSET = 28;
export const CHAIR_HIGHLIGHT_DEPTH = 16;
export const SPRITE_WORLD_DEPTH = 17;
/** World-space speech bubbles: above tilemap layers and in-world UI (e.g. appliance overlays at 9998). */
export const SPEECH_BUBBLE_DEPTH = 10000;

/** Scripted walk speed for non-player cast (half of `Character` default 3). */
export const NPC_WALK_SPEED = 1.5;

export const FALLBACK_CAMERA_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 3000,
  maxY: 3000,
};

export const DEFAULT_GROUND_ENTRANCE_START = { x: 977.5, y: 1774.55 };
export const DEFAULT_GROUND_ENTRANCE_END = { x: 978.67, y: 1652.74 };
export const DEFAULT_ELEVATOR_ENTRANCE_START = { x: 767.72, y: 894.976 };
export const DEFAULT_ELEVATOR_ENTRANCE_END = { x: 768.06, y: 776.418 };

// Keep car spawn inside current rendered tile bounds.
export const DEFAULT_CAR_SPAWN = { x: 1069, y: 1442 };
