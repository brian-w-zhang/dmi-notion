import type {
  LiveCharacter, ConversationRecord, WorldEvent,
  CharacterStepState, StepFile, LogEntry, PlanBlock,
} from "./types.js"

export class WorldState {
  step = 0
  simTime: Date
  readonly secPerStep: number
  readonly characters: Map<string, LiveCharacter> = new Map()
  private activeConversations: Map<string, ConversationRecord> = new Map()
  private completedConversations: ConversationRecord[] = []
  private events: WorldEvent[] = []

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
  }

  getSnapshot(): Record<string, LiveCharacter> {
    return Object.fromEntries(
      [...this.characters.entries()].map(([k, v]) => [k, { ...v }])
    )
  }

  // ── Perception ──────────────────────────────────────────────────────────────

  getNearby(characterName: string, radiusTiles = 5): LiveCharacter[] {
    const origin = this.getCharacter(characterName).tile
    return [...this.characters.values()].filter((c) => {
      if (c.name === characterName) return false
      const dx = c.tile[0] - origin[0]
      const dy = c.tile[1] - origin[1]
      return Math.sqrt(dx * dx + dy * dy) <= radiusTiles
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

  startConversation(id: string, record: ConversationRecord) {
    this.activeConversations.set(id, record)
    for (const p of record.participants) {
      const c = this.characters.get(p)
      if (c) {
        c.state = "in_conversation"
        c.activeConversationId = id
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

  // ── Events ──────────────────────────────────────────────────────────────────

  addEvent(event: WorldEvent) {
    this.events.push(event)
  }

  // ── Step advancement ────────────────────────────────────────────────────────

  advanceStep(): { completedConversations: ConversationRecord[]; events: WorldEvent[] } {
    // Advance plan indices for all characters
    for (const key of this.characters.keys()) {
      this.advancePlanIndex(key)
    }

    // Tick cooldowns
    this.tickInteractionCooldowns()

    // Tick sim time first, then check for hour rollover
    this.step++
    this.simTime = new Date(this.simTime.getTime() + this.secPerStep * 1000)
    this.maybeClearHourlyLog()

    const completed = [...this.completedConversations]
    const events = [...this.events]
    this.completedConversations = []
    this.events = []

    return { completedConversations: completed, events }
  }

  toStepFile(completedConversations: ConversationRecord[], events: WorldEvent[]): StepFile {
    const characters: Record<string, CharacterStepState> = {}
    for (const [name, c] of this.characters) {
      characters[name] = {
        tile: c.tile,
        action: c.action,
        emoji: c.emoji,
        animationKey: c.animationKey,
        facing: c.facing,
        needs: { ...c.needs },
        state: c.state,
        currentPlanBlock: this.getCurrentPlanBlock(name),
        currently: c.currently,
      }
    }
    return {
      step: this.step,
      simTime: this.simTime.toISOString(),
      realTimestamp: new Date().toISOString(),
      characters,
      conversations: completedConversations,
      events,
    }
  }
}
