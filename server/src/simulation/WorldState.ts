import type { LiveCharacter, ConversationRecord, WorldEvent, CharacterStepState, StepFile } from "./types.js"

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
    this.addEvent({ type: "conversation_start", character: record.participants[0], detail: `with ${record.participants[1]}` })
  }

  endConversation(id: string) {
    const record = this.activeConversations.get(id)
    if (!record) return
    record.endStep = this.step
    this.completedConversations.push(record)
    this.activeConversations.delete(id)
    for (const p of record.participants) {
      const c = this.characters.get(p)
      if (c) {
        c.state = "active"
        c.activeConversationId = undefined
        c.threadId = undefined
      }
    }
    this.addEvent({ type: "conversation_end", character: record.participants[0], detail: `with ${record.participants[1]}` })
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  addEvent(event: WorldEvent) {
    this.events.push(event)
  }

  // ── Step advancement ────────────────────────────────────────────────────────

  advanceStep(): { completedConversations: ConversationRecord[]; events: WorldEvent[] } {
    const completed = [...this.completedConversations]
    const events = [...this.events]
    this.completedConversations = []
    this.events = []
    this.step++
    this.simTime = new Date(this.simTime.getTime() + this.secPerStep * 1000)
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
