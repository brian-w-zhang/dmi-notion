// ── Step file schema ─────────────────────────────────────────────────────────
// Written by the server during simulation.
// Read by Phaser for replay. Must be stable — changing this breaks saved runs.

export type Facing = "front" | "back" | "left" | "right"
export type CharacterState = "active" | "in_conversation" | "idle" | "blocked"

// ── Planning types ────────────────────────────────────────────────────────────

export interface PlanBlock {
  action: string        // e.g. "sales_call"
  description: string   // e.g. "Making outbound calls to paper clients"
  locationId: string    // zone name — Phaser resolves to tile coords
  emoji: string
  startMin: number      // minutes since midnight
  durationMin: number
}

// ── Day log ───────────────────────────────────────────────────────────────────

export interface ActionLogEntry {
  type: "action"
  action: string
  description: string
  locationId: string
  startMin: number
  endMin: number
  followedPlan: boolean
  deviationReason?: string
}

export interface DialogueLogEntry {
  type: "dialogue"
  with: string          // character key
  startMin: number
  endMin: number
  summary: string
  appraisal: {
    valence: "positive" | "neutral" | "negative"
    relationshipDelta: "improved" | "neutral" | "damaged"
    takeaway: string
  }
}

export type LogEntry = ActionLogEntry | DialogueLogEntry

// ── Character step state (in step files) ──────────────────────────────────────

export interface CharacterStepState {
  tile: [number, number]
  action: string
  emoji: string
  animationKey: string
  facing: Facing
  needs: Record<string, number>
  state: CharacterState
  currentPlanBlock?: PlanBlock  // what they were supposed to be doing this tick
  currently: string             // living one-sentence status
}

export interface ConversationTurn {
  speaker: string
  line: string
  tone?: string
  nonverbal?: string
}

export interface ConversationRecord {
  id: string
  participants: [string, string]
  location: string
  trigger: string
  turns: ConversationTurn[]
  summary?: string
  appraisal?: DialogueLogEntry["appraisal"]
  startStep: number
  endStep: number
}

export interface WorldEvent {
  type: "action_complete" | "conversation_start" | "conversation_end" | "need_urgent" | "plan_changed" | "deviation"
  character: string
  detail: string
}

export interface StepFile {
  step: number
  simTime: string
  realTimestamp: string
  characters: Record<string, CharacterStepState>
  conversations: ConversationRecord[]
  events: WorldEvent[]
}

// ── Simulation meta ───────────────────────────────────────────────────────────

export interface SimulationMeta {
  simCode: string
  startSimTime: string
  secPerStep: number
  totalSteps: number
  characters: string[]
}

// ── Live world state (in-memory only) ─────────────────────────────────────────

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

  // Planning
  dayPlan: PlanBlock[]
  planIndex: number             // index into dayPlan of currently active block
  planAdherence: number         // 0–1; from Big Five conscientiousness
  completedThisHour: string[]   // action keys done in last 60 sim minutes; cleared hourly

  // Day memory
  dayLog: LogEntry[]
  currently: string             // living status updated by agent after notable events

  // Short-term interaction cooldown
  recentInteractions: Record<string, number>  // characterKey → minutes remaining

  // Notion conversation thread
  threadId?: string
}
