export const SEC_PER_STEP = 10
export const SIM_HOURS = 9
export const TICKS_PER_DAY = (SIM_HOURS * 3600) / SEC_PER_STEP  // 3240

// Character movement speed in pixels per simulation step.
// At replay MS_PER_STEP=185ms: 64px/step ≈ 346px/sec on screen (~10 tiles/sec).
export const MOVE_SPEED_PX = 64
