import type {
  LiveCharacter, ConversationRecord, GroupConversationRecord, WorldEvent,
  CharacterStepState, StepFile, LogEntry, PlanBlock, PADState, MeetingState,
} from "./types.js"
import { resolveLocationPos, inferZoneFromPos } from "./WorldData.js"
import { buildCommuteFrames, COMMUTE_STEPS } from "./CommuteSimulator.js"
import { decayNeeds } from "./needsDecay.js"
import { findPixelPath } from "./ServerPathfinder.js"
import { MOVE_SPEED_PX } from "./config.js"

export class WorldState {
  step = 0
  simTime: Date
  readonly secPerStep: number
  readonly characters: Map<string, LiveCharacter> = new Map()
  private activeConversations: Map<string, ConversationRecord> = new Map()
  private completedConversations: ConversationRecord[] = []
  private completedGroupConversations: GroupConversationRecord[] = []
  private pendingAnnouncements: { from: string; message: string }[] = []
  private events: WorldEvent[] = []

  // Active office-wide meeting state (null when no meeting is running)
  activeMeeting: MeetingState | null = null

  constructor(startSimTime: Date, secPerStep = 300) {
    this.simTime = new Date(startSimTime)
    this.secPerStep = secPerStep
  }

  // ── Sim time helpers ────────────────────────────────────────────────────────

  get simMinutes(): number {
    return this.simTime.getHours() * 60 + this.simTime.getMinutes()
  }

  simTimeString(): string {
    return this.simTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  // ── Character access ────────────────────────────────────────────────────────

  getCharacter(name: string): LiveCharacter {
    const c = this.characters.get(name)
    if (!c) throw new Error(`Unknown character: ${name}`)
    return c
  }

  getActiveCharacters(): LiveCharacter[] {
    return [...this.characters.values()].filter(
      (c) => c.state === "active" || c.state === "idle"
    )
    // Note: "in_conversation", "using_appliance", and "pre_arrival" characters are excluded
  }

  getSnapshot(): Record<string, LiveCharacter> {
    return Object.fromEntries(
      [...this.characters.entries()].map(([k, v]) => [k, { ...v }])
    )
  }

  // ── Perception ──────────────────────────────────────────────────────────────

  getNearby(characterName: string, radiusPx = 160): LiveCharacter[] {
    const origin = this.getCharacter(characterName).pos
    return [...this.characters.values()].filter((c) => {
      if (c.name === characterName) return false
      const dx = c.pos[0] - origin[0]
      const dy = c.pos[1] - origin[1]
      return Math.sqrt(dx * dx + dy * dy) <= radiusPx
    })
  }

  // ── Plan management ─────────────────────────────────────────────────────────

  // Returns the plan block active at the current simMinutes, or undefined if
  // before first block or after last block.
  getCurrentPlanBlock(characterName: string): PlanBlock | undefined {
    const c = this.getCharacter(characterName)
    const now = this.simMinutes
    for (let i = c.dayPlan.length - 1; i >= 0; i--) {
      const block = c.dayPlan[i]
      if (now >= block.startMin && now < block.startMin + block.durationMin) {
        return block
      }
    }
    return undefined
  }

  getNextPlanBlock(characterName: string): PlanBlock | undefined {
    const c = this.getCharacter(characterName)
    const now = this.simMinutes
    return c.dayPlan.find(b => b.startMin > now)
  }

  // Advances planIndex to match current sim time. Called at the start of each step.
  advancePlanIndex(characterName: string): void {
    const c = this.getCharacter(characterName)
    const now = this.simMinutes
    let idx = 0
    for (let i = 0; i < c.dayPlan.length; i++) {
      const b = c.dayPlan[i]
      if (now >= b.startMin) idx = i
    }
    c.planIndex = idx
  }

  // ── Day log ─────────────────────────────────────────────────────────────────

  pushLogEntry(characterName: string, entry: LogEntry): void {
    const c = this.getCharacter(characterName)
    c.dayLog.push(entry)
    if (entry.type === "action") {
      c.completedThisHour.push(entry.action)
    }
  }

  getRecentLog(characterName: string, count = 5): LogEntry[] {
    const c = this.getCharacter(characterName)
    return c.dayLog.slice(-count)
  }

  // Clear completedThisHour for all characters once per sim hour.
  // Called from advanceStep() when the hour ticks over.
  private lastHourCleared = -1
  private maybeClearHourlyLog(): void {
    const hour = Math.floor(this.simMinutes / 60)
    if (hour !== this.lastHourCleared) {
      this.lastHourCleared = hour
      for (const c of this.characters.values()) {
        c.completedThisHour = []
      }
    }
  }

  // ── Currently (living status) ───────────────────────────────────────────────

  updateCurrently(characterName: string, status: string): void {
    this.getCharacter(characterName).currently = status
  }

  // ── Interaction cooldown ────────────────────────────────────────────────────

  setInteractionCooldown(fromKey: string, toKey: string, minutes: number): void {
    const c = this.getCharacter(fromKey)
    c.recentInteractions[toKey] = minutes
  }

  isOnCooldown(fromKey: string, toKey: string): boolean {
    const c = this.getCharacter(fromKey)
    return (c.recentInteractions[toKey] ?? 0) > 0
  }

  private tickInteractionCooldowns(): void {
    const decrement = this.secPerStep / 60
    for (const c of this.characters.values()) {
      for (const key of Object.keys(c.recentInteractions)) {
        c.recentInteractions[key] -= decrement
        if (c.recentInteractions[key] <= 0) {
          delete c.recentInteractions[key]
        }
      }
    }
  }

  // ── Conversation state ──────────────────────────────────────────────────────

  // Called by onTurnComplete callback — appends a turn and updates speaker's visible action.
  pushConversationTurn(id: string, turn: import("./types.js").ConversationTurn): void {
    const record = this.activeConversations.get(id)
    if (!record) return
    record.turns.push(turn)
    const c = this.characters.get(turn.speaker)
    if (c) {
      const preview = turn.line.length > 60 ? turn.line.slice(0, 58) + "…" : turn.line
      c.action = `"${preview}"`
    }
  }

  startConversation(id: string, record: ConversationRecord) {
    this.activeConversations.set(id, record)
    for (const p of record.participants) {
      const c = this.characters.get(p)
      if (c) {
        c.state = "in_conversation"
        c.activeConversationId = id
        c.emoji = "🗣️"
        // Save where the character was headed (or where they currently are) so
        // they can resume after the conversation. Persists through endConversation —
        // cleared only when setDestination is called with a new destination.
        c.interruptedDestinationId =
          c.destinationId                             // mid-transit: resume the journey
          ?? this.getCurrentPlanBlock(p)?.locationId  // idle at plan location: resume plan
          ?? undefined
        // Stop movement for the duration of the conversation
        if (c.path.length > 0) {
          c.path = []
          c.destinationId = undefined
          c.animationKey = `idle_${c.facing}`
        }
      }
    }
    this.addEvent({
      type: "conversation_start",
      character: record.participants[0],
      detail: `with ${record.participants[1]}`,
    })
  }

  endConversation(id: string, summary?: string, appraisal?: ConversationRecord["appraisal"]) {
    const record = this.activeConversations.get(id)
    if (!record) return
    record.endStep = this.step
    if (summary) record.summary = summary
    if (appraisal) record.appraisal = appraisal

    this.completedConversations.push(record)
    this.activeConversations.delete(id)

    for (const p of record.participants) {
      const c = this.characters.get(p)
      if (c) {
        c.state = "active"
        c.activeConversationId = undefined
        c.threadId = undefined
        c.emoji = "💭"            // brief post-conversation thinking state
        c.needsPerception = true  // conversation done — agent decides what to do next
        c.lastCompletedAppliance = undefined  // social contact resets repeat-block
        // interruptedDestinationId intentionally kept — agent reads it on next tick
      }
      // Apply 60-minute interaction cooldown between both participants
      const other = record.participants.find(x => x !== p)
      if (other) this.setInteractionCooldown(p, other, 60)
    }

    // Write dialogue log entries for both participants
    if (summary && appraisal) {
      const startMin = this.simMinutes - Math.floor((record.endStep - record.startStep) * this.secPerStep / 60)
      for (const p of record.participants) {
        const other = record.participants.find(x => x !== p)!
        this.pushLogEntry(p, {
          type: "dialogue",
          with: other,
          startMin,
          endMin: this.simMinutes,
          summary,
          appraisal,
        })
      }
    }

    this.addEvent({
      type: "conversation_end",
      character: record.participants[0],
      detail: `with ${record.participants[1]}`,
    })
  }

  // Public method so ConversationFlow can push a completed record
  // (used when the conversation finishes asynchronously mid-step)
  pushCompletedConversation(record: ConversationRecord): void {
    this.completedConversations.push(record)
  }

  // ── Announcements ───────────────────────────────────────────────────────────

  // Broadcast an announcement to all characters' next tick context and day log.
  broadcastAnnouncement(fromKey: string, message: string): void {
    this.pendingAnnouncements.push({ from: fromKey, message })
    this.addEvent({ type: "announcement", character: fromKey, detail: message.slice(0, 80) })

    const simMin = this.simMinutes
    for (const c of this.characters.values()) {
      c.dayLog.push({ type: "announcement", from: fromKey, message, simMin })
    }
  }

  // Returns and clears pending announcements (consumed each step).
  drainAnnouncements(): { from: string; message: string }[] {
    const out = [...this.pendingAnnouncements]
    this.pendingAnnouncements = []
    return out
  }

  // ── Meeting management ───────────────────────────────────────────────────────

  // ASSEMBLY_TICKS: how many ticks to wait for everyone to arrive before starting.
  // At secPerStep=300 and PERCEPTION_INTERVAL=5 → 5 perception rounds → ~25 sim min travel window.
  private static readonly ASSEMBLY_TICKS = 25

  startMeeting(topic: string, initiatorKey: string): MeetingState {
    const participants = [...this.characters.keys()]
    this.activeMeeting = {
      topic,
      initiatorKey,
      startStep: this.step,
      assemblyDueStep: this.step + WorldState.ASSEMBLY_TICKS,
      participants,
      phase: "assembling",
    }
    // All participants move to conference_room; force their state
    for (const key of participants) {
      const c = this.characters.get(key)
      if (c && key !== initiatorKey) {
        c.state = "active"
        this.setDestination(key, "conference_room")
        c.action = "heading to the meeting"
        c.emoji = "🏃"
      }
    }
    this.addEvent({ type: "meeting_start", character: initiatorKey, detail: topic })
    console.log(`\n[Meeting] "${topic}" called by ${initiatorKey} — assembling ${participants.length} characters`)
    return this.activeMeeting
  }

  endMeeting(summary?: string): void {
    if (!this.activeMeeting) return
    const { participants, topic } = this.activeMeeting
    this.activeMeeting.phase = "ended"
    this.addEvent({ type: "meeting_end", character: participants[0], detail: topic })
    const simMin = this.simMinutes
    for (const key of participants) {
      this.pushLogEntry(key, { type: "meeting", topic, participants, simMin, summary })
      const c = this.characters.get(key)
      if (c) {
        c.state = "active"
        // Send everyone back to their desk
        this.setDestination(key, `${key}_desk`)
      }
    }
    this.activeMeeting = null
    console.log(`[Meeting] ended — ${summary?.slice(0, 60) ?? "no summary"}`)
  }

  pushGroupConversation(record: GroupConversationRecord): void {
    this.completedGroupConversations.push(record)
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  addEvent(event: WorldEvent) {
    this.events.push(event)
  }

  // ── Appliance lock ───────────────────────────────────────────────────────────

  startApplianceAction(
    characterName: string,
    applianceName: string,
    actionName: string,
    durationSteps: number,
    needDeltas: Record<string, number>
  ): void {
    const c = this.getCharacter(characterName)
    c.state = "using_appliance"
    c.interruptedDestinationId = undefined  // consumed — character is now acting
    c.activeApplianceAction = {
      applianceName,
      actionName,
      lockedUntilStep: this.step + durationSteps,
      pendingNeedDeltas: needDeltas,
    }
    this.addEvent({ type: "action_complete", character: characterName, detail: `started ${actionName} on ${applianceName}` })
  }

  // Called each step — expires appliance locks and applies deferred need deltas.
  private tickApplianceLocks(): void {
    for (const c of this.characters.values()) {
      if (c.state !== "using_appliance" || !c.activeApplianceAction) continue
      if (this.step < c.activeApplianceAction.lockedUntilStep) continue

      // Lock expired — apply need deltas, release, trigger perception
      c.needsPerception = true
      c.lastCompletedAppliance = c.activeApplianceAction.actionName
      this.applyNeedDeltas(c.name, c.activeApplianceAction.pendingNeedDeltas)
      this.pushLogEntry(c.name, {
        type: "action",
        action: "use_appliance",
        description: `finished ${c.activeApplianceAction.actionName} at ${c.activeApplianceAction.applianceName}`,
        locationId: c.activeApplianceAction.applianceName,
        startMin: this.simMinutes - Math.floor(
          (this.step - (c.activeApplianceAction.lockedUntilStep - Object.keys(c.activeApplianceAction.pendingNeedDeltas).length)) * this.secPerStep / 60
        ),
        endMin: this.simMinutes,
        followedPlan: true,
      })
      this.addEvent({ type: "action_complete", character: c.name, detail: `finished ${c.activeApplianceAction.actionName}` })
      c.activeApplianceAction = undefined
      c.state = "active"
    }
  }

  // ── Arrival management ───────────────────────────────────────────────────────

  // Manages the two-phase arrival sequence for pre_arrival and commuting characters.
  private tickArrivals(): void {
    for (const [key, c] of this.characters) {
      // ── Start commute when the window opens ────────────────────────────────
      if (c.state === "pre_arrival" && this.step >= c.commuteStartStep) {
        const seq = buildCommuteFrames(key)
        if (seq) {
          c.state = "commuting"
          c.commuteQueue = { frames: seq.frames, idx: 0, walkOutPos: seq.walkOutPos }
          c.carState = { ...seq.frames[0], visible: true }
          console.log(`  [Commute] ${key} → ${seq.frames.length} frames, parks at ${seq.walkOutPos}`)
        } else {
          // No car config — fall back to foot arrival at elevator exit pixel
          c.pos = [768, 704]
          c.state = "active"
          c.facing = "front"
          c.animationKey = "walk_front"
          c.needsPerception = true
          this.setDestination(key, c.dayPlan[0]?.locationId ?? "")
        }
      }

      // ── Advance commute frame ──────────────────────────────────────────────
      if (c.state === "commuting" && c.commuteQueue) {
        const q = c.commuteQueue
        q.idx++
        if (q.idx < q.frames.length) {
          c.carState = { ...q.frames[q.idx] }
        } else {
          // Commute complete — place character inside office and fire perception.
          // The frontend replay controller handles the visual entrance animation.
          c.carState = { ...q.frames[q.frames.length - 1], visible: true }  // parked
          c.commuteQueue = undefined
          c.state = "active"
          c.facing = "front"
          c.animationKey = "idle_front"
          c.action = "arrived at the office"
          c.emoji = "🏢"
          c.pos = c.commuteQueue!.walkOutPos
          c.arrivalWaypoints = undefined
          c.needsPerception = true
          console.log(`  [Arrival] ${key} → commute complete, active at ${c.pos}`)
        }
      }

    }
  }

  // ── Physics ──────────────────────────────────────────────────────────────────

  // Advance all characters MOVE_SPEED_PX pixels toward the next path waypoint.
  // Called every tick regardless of whether agents ran this round.
  advancePhysics(): void {
    for (const c of this.characters.values()) {
      if (c.state === "pre_arrival" || c.state === "commuting") continue

      decayNeeds(c.name, c.needs)

      if (c.state === "in_conversation" || c.state === "using_appliance") continue
      if (c.path.length === 0) continue

      const [wx, wy] = c.path[0]
      const dx = wx - c.pos[0]
      const dy = wy - c.pos[1]
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= MOVE_SPEED_PX) {
        // Snap to waypoint and advance
        c.pos = [wx, wy]
        c.path = c.path.slice(1)
      } else {
        const scale = MOVE_SPEED_PX / dist
        c.pos = [Math.round(c.pos[0] + dx * scale), Math.round(c.pos[1] + dy * scale)]
      }

      // Update facing from movement direction (toward current or next waypoint)
      if (Math.abs(dx) >= Math.abs(dy)) {
        c.facing = dx > 0 ? "right" : "left"
      } else {
        c.facing = dy > 0 ? "front" : "back"
      }

      if (c.path.length === 0) {
        c.animationKey = `idle_${c.facing}`
        c.destinationId = undefined
        c.needsPerception = true
        this.addEvent({ type: "action_complete", character: c.name, detail: "reached destination" })
      } else {
        c.animationKey = `walk_${c.facing}`
      }
    }
  }

  // Applies PAD (Pleasure, Arousal, Dominance) deltas after an appraisal.
  applyPadDeltas(characterName: string, deltas: Partial<PADState>): void {
    const c = this.getCharacter(characterName)
    if (deltas.pleasure !== undefined)
      c.pad.pleasure = Math.max(-1, Math.min(1, c.pad.pleasure + deltas.pleasure))
    if (deltas.arousal !== undefined)
      c.pad.arousal = Math.max(-1, Math.min(1, c.pad.arousal + deltas.arousal))
    if (deltas.dominance !== undefined)
      c.pad.dominance = Math.max(-1, Math.min(1, c.pad.dominance + deltas.dominance))
  }

  // Applies need deltas from an appliance action.
  // Positive delta = satisfying (increases value toward 1.0).
  // Negative delta = worsening (decreases value toward 0.0).
  applyNeedDeltas(characterName: string, deltas: Record<string, number>): void {
    const c = this.getCharacter(characterName)
    for (const [need, delta] of Object.entries(deltas)) {
      const current = c.needs[need] ?? 0.5
      c.needs[need] = Math.max(0, Math.min(1, current + delta / 100))
    }
  }

  // Sets a pixel path toward a locationId (desk, zone, or appliance name).
  // The exact pixel from the location data becomes the final path waypoint.
  setDestination(characterName: string, locationId: string): boolean {
    const c = this.getCharacter(characterName)
    const dest = resolveLocationPos(locationId)
    if (!dest) return false
    c.path = findPixelPath(c.pos, dest, dest)
    c.destinationId = locationId
    c.interruptedDestinationId = undefined
    return true
  }

  // ── Step advancement ────────────────────────────────────────────────────────

  advanceStep(): { completedConversations: ConversationRecord[]; completedGroupConversations: GroupConversationRecord[]; announcements: { from: string; message: string }[]; events: WorldEvent[] } {
    // Transition pre_arrival characters that have reached their first plan block time
    this.tickArrivals()

    // Advance plan indices for all characters
    for (const key of this.characters.keys()) {
      this.advancePlanIndex(key)
    }

    // Expire finished appliance locks and apply deferred need deltas
    this.tickApplianceLocks()

    // Tick cooldowns
    this.tickInteractionCooldowns()

    // Tick sim time first, then check for hour rollover
    this.step++
    this.simTime = new Date(this.simTime.getTime() + this.secPerStep * 1000)
    this.maybeClearHourlyLog()

    const completed = [...this.completedConversations]
    const completedGroup = [...this.completedGroupConversations]
    const announcements = this.drainAnnouncements()
    const events = [...this.events]
    this.completedConversations = []
    this.completedGroupConversations = []
    this.events = []

    return { completedConversations: completed, completedGroupConversations: completedGroup, announcements, events }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  toStepFile(
    completedConversations: ConversationRecord[],
    completedGroupConversations: GroupConversationRecord[],
    announcements: { from: string; message: string }[],
    events: WorldEvent[]
  ): StepFile {
    const characters: Record<string, CharacterStepState> = {}
    const cars: Record<string, import("./types.js").CarStepState> = {}
    for (const [name, c] of this.characters) {
      if (c.carState) cars[name] = { ...c.carState }
      characters[name] = {
        pos: c.pos,
        action: c.action,
        emoji: c.emoji,
        animationKey: c.animationKey,
        facing: c.facing,
        needs: { ...c.needs },
        pad: { ...c.pad },
        state: c.state,
        currentPlanBlock: this.getCurrentPlanBlock(name),
        currently: c.currently,
        thinking: c.lastThinking,
        applianceAction: c.activeApplianceAction
          ? {
              applianceName: c.activeApplianceAction.applianceName,
              actionName: c.activeApplianceAction.actionName,
              lockedUntilStep: c.activeApplianceAction.lockedUntilStep,
            }
          : undefined,
      }
    }
    const activeConversations = [...this.activeConversations.values()].map((r) => ({
      id: r.id,
      participants: r.participants,
      location: r.location,
      turns: r.turns.map((t) => ({ speaker: t.speaker, line: t.line, tone: t.tone })),
    }))

    return {
      step: this.step,
      simTime: this.simTime.toISOString(),
      realTimestamp: new Date().toISOString(),
      characters,
      cars,
      conversations: completedConversations,
      groupConversations: completedGroupConversations,
      activeConversations,
      announcements,
      events,
    }
  }
}

