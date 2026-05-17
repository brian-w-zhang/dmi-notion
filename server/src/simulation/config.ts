export const SEC_PER_STEP = 10
export const SIM_HOURS = 9
export const TICKS_PER_DAY = (SIM_HOURS * 3600) / SEC_PER_STEP  // 3240

// Character movement speed in pixels per simulation step.
// At replay MS_PER_STEP=185ms: 64px/step ≈ 346px/sec on screen (~10 tiles/sec).
export const MOVE_SPEED_PX = 64

// How many fallback-interval steps to spread perception across the cast.
// Each character gets a unique offset so at most 1-2 characters perceive per step
// on the fallback path instead of all firing in the same step.
export const PERCEPTION_STAGGER = true

// Steps to wait between each dialogue turn.
// Spreads a conversation across real simulation steps so turns appear gradually
// in the frontend instead of all arriving in the same 1-2 steps.
// At SEC_PER_STEP=10: delay=2 → each exchange is ~20 sim-seconds apart.
export const DIALOGUE_TURN_DELAY_STEPS = 2
