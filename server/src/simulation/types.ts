// ── Step file schema ─────────────────────────────────────────────────────────
// Written by the server during simulation.
// Read by Phaser for replay. Must be stable — changing this breaks saved runs.

export type Facing = "front" | "back" | "left" | "right"
export type CharacterState = "active" | "in_conversation" | "using_appliance" | "idle" | "blocked" | "pre_arrival"

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
  thinking?: string           // interior deliberation from agent — for interpretability display
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

export interface AnnouncementLogEntry {
  type: "announcement"
  from: string          // character key of announcer
  message: string
  simMin: number
}

export interface MeetingLogEntry {
  type: "meeting"
  topic: string
  participants: string[]  // character keys
  simMin: number
  summary?: string
}

export type LogEntry = ActionLogEntry | DialogueLogEntry | AnnouncementLogEntry | MeetingLogEntry

// ── Character step state (in step files) ──────────────────────────────────────

export interface CharacterStepState {
  tile: [number, number]
  action: string
  emoji: string
  animationKey: string
  facing: Facing
  needs: Record<string, number>
  pad: PADState
  state: CharacterState
  currentPlanBlock?: PlanBlock  // what they were supposed to be doing this tick
  currently: string             // living one-sentence status
  thinking?: string             // last interior deliberation from agent (persists until next perception round)
  applianceAction?: {           // set while state === "using_appliance"
    applianceName: string
    actionName: string
    lockedUntilStep: number
  }
}

export interface ConversationTurn {
  speaker: string
  line: string
  tone?: string
  nonverbal?: string
  thinking?: string           // interior state before speaking — not shown to other characters
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
  type: "action_complete" | "conversation_start" | "conversation_end" | "need_urgent" | "plan_changed" | "deviation" | "announcement" | "meeting_start" | "meeting_end"
  character: string
  detail: string
}

// ── Meeting state ─────────────────────────────────────────────────────────────

export type MeetingPhase = "assembling" | "in_progress" | "ended"

export interface MeetingState {
  topic: string
  initiatorKey: string
  startStep: number
  assemblyDueStep: number   // step at which meeting starts regardless of who arrived
  participants: string[]    // character keys who have been included
  phase: MeetingPhase
  conversationId?: string
}

// ── Group conversation ────────────────────────────────────────────────────────

export interface GroupConversationRecord {
  id: string
  participants: string[]
  location: string
  topic: string
  turns: ConversationTurn[]
  summary?: string
  startStep: number
  endStep: number
}

export interface StepFile {
  step: number
  simTime: string
  realTimestamp: string
  characters: Record<string, CharacterStepState>
  conversations: ConversationRecord[]
  groupConversations: GroupConversationRecord[]
  announcements: { from: string; message: string }[]
  events: WorldEvent[]
}

// ── Simulation meta ───────────────────────────────────────────────────────────

export interface SimulationMeta {
  simCode: string
  startSimTime: string
  secPerStep: number
  totalSteps: number
  characters: string[]
  seed: number
}

// ── Live world state (in-memory only) ─────────────────────────────────────────

export interface PADState {
  pleasure: number    // -1.0 to 1.0
  arousal: number     // -1.0 to 1.0
  dominance: number   // -1.0 to 1.0
}

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
  destinationId?: string            // locationId passed to setDestination — cleared when path empties
  interruptedDestinationId?: string // raw locationId saved when a conversation interrupts transit
                                    // persists until setDestination is called with a new destination

  // Appliance action in progress — character is locked until lockedUntilStep
  activeApplianceAction?: {
    applianceName: string
    actionName: string
    lockedUntilStep: number
    pendingNeedDeltas: Record<string, number>
  }

  // PAD emotional state (updated by appraisal after conversations)
  pad: PADState

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

  // Last interior deliberation from agent (written each perception round, read into step files)
  lastThinking?: string
}
