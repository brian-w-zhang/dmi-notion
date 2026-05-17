// ── Step file schema ─────────────────────────────────────────────────────────
// Written by the server during simulation.
// Read by Phaser for replay. Must be stable — changing this breaks saved runs.

export type Facing = "front" | "back" | "left" | "right"
export type CharacterState = "active" | "in_conversation" | "using_appliance" | "idle" | "blocked" | "pre_arrival" | "commuting"

export interface CarStepState {
  x: number
  y: number
  facing: Facing
  anim: "drive" | "idle"
  visible: boolean
}

// ── Planning types ────────────────────────────────────────────────────────────

export interface PlanBlock {
  action: string        // e.g. "sales_call"
  description: string   // e.g. "Making outbound calls to paper clients"
  locationId: string    // zone or appliance name — resolved to pixel coords by server
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
  thinking?: string
}

export interface DialogueLogEntry {
  type: "dialogue"
  with: string
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
  from: string
  message: string
  simMin: number
}

export interface MeetingLogEntry {
  type: "meeting"
  topic: string
  participants: string[]
  simMin: number
  summary?: string
}

export type LogEntry = ActionLogEntry | DialogueLogEntry | AnnouncementLogEntry | MeetingLogEntry

// ── Character step state (in step files) ──────────────────────────────────────

export interface CharacterStepState {
  pos: [number, number]   // pixel coords [x, y]
  action: string
  emoji: string
  animationKey: string
  facing: Facing
  needs: Record<string, number>
  pad: PADState
  state: CharacterState
  currentPlanBlock?: PlanBlock
  currently: string
  thinking?: string
  applianceAction?: {
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
  thinking?: string
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
  assemblyDueStep: number
  participants: string[]
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

export interface ActiveConversationSnapshot {
  id: string
  participants: [string, string]
  location: string
  turns: { speaker: string; line: string; tone?: string }[]
}

export interface StepFile {
  step: number
  simTime: string
  realTimestamp: string
  characters: Record<string, CharacterStepState>
  cars: Record<string, CarStepState>
  conversations: ConversationRecord[]
  groupConversations: GroupConversationRecord[]
  activeConversations: ActiveConversationSnapshot[]
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
  pos: [number, number]   // pixel coords [x, y]
  action: string
  emoji: string
  animationKey: string
  facing: Facing
  needs: Record<string, number>
  state: CharacterState
  activeConversationId?: string
  path: [number, number][]          // pixel waypoints remaining to destination
  destinationId?: string
  interruptedDestinationId?: string

  // Commute — scripted car sequence before the character becomes active
  commuteStartStep: number
  commuteQueue?: { frames: import("./CommuteSimulator.js").CarFrame[]; idx: number; walkOutPos: [number, number] }
  carState?: CarStepState

  needsPerception: boolean
  lastPerceptionStep: number

  activeApplianceAction?: {
    applianceName: string
    actionName: string
    lockedUntilStep: number
    pendingNeedDeltas: Record<string, number>
  }

  pad: PADState

  // Planning
  dayPlan: PlanBlock[]
  planIndex: number
  planAdherence: number
  completedThisHour: string[]

  // Day memory
  dayLog: LogEntry[]
  currently: string
  recentInteractions: Record<string, number>

  threadId?: string
  lastThinking?: string
  lastCompletedAppliance?: string
  arrivalWaypoints?: ArrivalWaypoint[]
}

export interface ArrivalWaypoint {
  kind: "walk" | "teleport"
  pos: [number, number]   // pixel coords
}
