# DMI Hackathon Roadmap

## What's Done
- [x] Tiled map — zones, objects, sit/action points, office-objects.json, appliances.json
- [x] Actions — appliance action definitions, need deltas, SFX, progress bar UI
- [x] Needs model — per-character decay rates, urgency curves, overrides (character_need_overrides.json)
- [x] Pathfinding — A* grid (CollisionSystem + PathfindingSystem)
- [x] Parking — CarAutoParkSystem, cars drive to lot on arrival
- [x] NPC runner skeleton — NpcActionRunner, NpcDialogueCoordinator, SpeechBubbleOverlay
- [x] Dashboard UI — character cards, individual detail pages, world actions view

---

## Remaining Work (ordered)

### 1. Spawn all cast as live NPCs
- [ ] Add remaining CHARACTER_ASSETS entries (Jim, Pam, Michael, Angela, etc.)
- [ ] Wire each into MainMap — `registerAnimations` + `new Character` + seat assignment
- [ ] Give each character a home seat from office-objects.json sit points

### 2. Backend bridge (Node server)
- [ ] `POST /action` endpoint — receives `{ character, actionType, params }`, applies to world state
- [ ] `GET /state` snapshot — current positions, needs, active actions
- [ ] WebSocket push — broadcasts world deltas to Phaser in real time
- [ ] Phaser WS client — listens and drives `NpcActionRunner` from server events

### 3. Notion agent setup (one per character)
- [ ] Create agent pages in Notion — personality + cognitive pipeline instructions
- [ ] Seed each character's Memory DB with S1–S2 canon memories (importance + PAD tags)
- [ ] Wire `@notionhq/agents-client` in the bridge server — one `agent.chatStream()` caller per character

### 4. Context assembly (what the agent receives each tick)
- [ ] Serialize current need vector → natural-language desire string (D2A bridge)
- [ ] Collect perception radius — nearby characters, active conversations, available appliances
- [ ] Assemble candidate action list (need urgency × distance × social context pre-score)
- [ ] Package: `{ needs_nl, percepts, candidates, active_plan, recent_memories }` → agent message

### 5. Memory retrieval
- [ ] Retrieval scorer: `importance × 0.4 + recency × 0.3 + state_match × 0.3`
- [ ] State match = cosine sim of current PAD to memory PAD tag
- [ ] Fixed Bag query per character (8–12 concept terms) as primary retrieval key
- [ ] Attach top-k memories to context payload before agent call

### 6. Agent decision → world execution loop
- [ ] Parse agent output: `{ actionType, params, dialogue? }`
- [ ] Route to backend worker: write Notion World State DB + `POST /action`
- [ ] Backend pushes to Phaser WS → `NpcActionRunner.queue(action)`
- [ ] Post-action: fixed delta for physical actions; appraisal agent call for social/dialogue
- [ ] Memory encode on action complete (character, action, outcome, PAD snapshot)

### 7. Daily planning
- [ ] Morning planning agent call — generates Level 1 daily intention (4–6 blocks)
- [ ] Phaser caches plan; decision tick checks plan before spontaneous scoring
- [ ] End-of-day reflection agent — updates Relationship pages, seeds tomorrow's plan

### 8. Conversation system
- [ ] Proximity trigger — two characters within N tiles → initiate conversation check
- [ ] Orchestrator mediates turns: `agentA.chatStream()` → parse response → `agentB.chatStream()`
- [ ] `NpcDialogueCoordinator` drives SpeechBubbleOverlay from WS events
- [ ] Write conversation to Notion Conversations DB (both sides, timestamps)

### 9. Demo / inspectability
- [ ] Event log — every action appended as `{ t, character, actionType, needState, paused_plan }`
- [ ] Dashboard: needs live feed, active action display per character
- [ ] Talking head trigger — high-salience events (confrontation, relationship delta > threshold)
- [ ] Basic DVR — replay event log to re-drive Phaser (play/pause)

---

## Critical Path for Hackathon MVP

> The minimum that produces a watchable, agent-driven simulation:

1. **All cast spawned** at their seats
2. **Backend bridge** running locally (REST + WS)
3. **One character wired end-to-end** (context → Notion agent → action → Phaser) — use Dwight
4. **Need-driven action selection** working for that character (bathroom, kitchen, desk)
5. **Memory retrieval** returning ≥1 relevant memory per tick
6. Repeat wire-up for remaining cast

Everything else (DVR, talking heads, conversation system, full planning) is additive on top.
