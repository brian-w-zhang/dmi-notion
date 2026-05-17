// ── Step file schema ─────────────────────────────────────────────────────────
// Written by the server during simulation.
// Read by Phaser for replay. Must be stable — changing this breaks saved runs.

export type Facing = "front" | "back" | "left" | "right"
export type CharacterState = "active" | "in_conversation" | "idle" | "blocked"

export interface CharacterStepState {
  tile: [number, number]
  action: string          // human-readable, e.g. "making coffee"
  emoji: string           // e.g. "☕"
  animationKey: string    // Phaser animation key
  facing: Facing
  needs: Record<string, number>  // 0–1 scale
  state: CharacterState
}

export interface ConversationTurn {
  speaker: string
  line: string
  tone?: string
  nonverbal?: string      // e.g. "glances at camera" — drives Phaser emote
}

export interface ConversationRecord {
  id: string
  participants: [string, string]
  location: string
  trigger: string
  turns: ConversationTurn[]
  startStep: number
  endStep: number
}

export interface WorldEvent {
  type: "action_complete" | "conversation_start" | "conversation_end" | "need_urgent" | "plan_changed"
  character: string
  detail: string
}

export interface StepFile {
  step: number
  simTime: string                               // ISO 8601 sim clock
  realTimestamp: string                         // when generated
  characters: Record<string, CharacterStepState>
  conversations: ConversationRecord[]           // completed this step
  events: WorldEvent[]
}

// ── Simulation meta ───────────────────────────────────────────────────────────
// Written once at simulation start. Phaser reads this first.

export interface SimulationMeta {
  simCode: string
  startSimTime: string
  secPerStep: number      // sim seconds advanced per round
  totalSteps: number      // updated as sim runs
  characters: string[]
}

// ── Live world state (in-memory only, not persisted) ─────────────────────────

export interface LiveCharacter {
  name: string
  tile: [number, number]
  action: string
  emoji: string
  animationKey: string
  facing: Facing
  needs: Record<string, number>
  state: CharacterState
  activeConversationId?: string
  plannedPath: [number, number][]
  currentPlanBlock: string
  threadId?: string       // Notion thread ID for ongoing conversation
}
