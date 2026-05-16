import Phaser from 'phaser';
import type { Character } from '../entities/Character';
import type { CharacterOwner } from '../config/characters';
import type { SpawnedCastMember } from '../scenes/mainMapCast';
import type { PathfindingSystem } from './PathfindingSystem';
import type { ApplianceInteractable } from './ApplianceInteractionSystem';
import { findOwnedChair, nearestSitPoint, setChairOccupancy, type Chair } from './ChairSystem';
import { SpeechBubbleOverlay } from '../entities/SpeechBubbleOverlay';
import type { NpcActionStep } from '../config/npcActionLoops';
import { DEFAULT_APPLIANCE_STEP_MS, DEFAULT_TALK_DURATION_MS, DESK_WORK_CONFIG } from '../config/npcActionLoops';
import type { NpcDialogueCoordinator, NpcDialogueSide } from './NpcDialogueCoordinator';
import { SPEECH_BUBBLE_DEPTH } from '../scenes/mainMap.constants';

const TALK_PURSUIT_RADIUS = 80;
/** Walk within this many px of an action point when waiting for the appliance to free up. */
const APPLIANCE_WAIT_RADIUS = 50;
/**
 * Walk within this many px of a target when waiting for them to finish a conversation.
 * Must be larger than TALK_PURSUIT_RADIUS (80) so we stay outside "trigger range"
 * until the wait resolves and we re-enter normal pursuit.
 */
const TALK_WAIT_RADIUS = 110;

// ─── Wait state ──────────────────────────────────────────────────────────────

interface ApplianceWaitState {
  kind: 'appliance';
  /** objectName of the appliance we are waiting for. */
  applianceName: string;
  emoji: string;
  actionPoint: { x: number; y: number };
  facing: string;
  durationMs: number;
}

interface TalkWaitState {
  kind: 'talk';
  targetOwner: CharacterOwner;
  durationMs: number;
}

type WaitState = ApplianceWaitState | TalkWaitState;

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Compute a waiting position `radius` pixels from `targetPx`, in the direction
 * FROM `targetPx` TO `fromPx` (i.e. on the "approach side" of the target).
 * If the NPC is already within the radius, they stay where they are.
 */
function computeWaitPosition(
  targetPx: { x: number; y: number },
  fromPx: { x: number; y: number },
  radius: number,
): { x: number; y: number } {
  const dx = fromPx.x - targetPx.x;
  const dy = fromPx.y - targetPx.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: targetPx.x + radius, y: targetPx.y };
  return {
    x: targetPx.x + (dx / dist) * radius,
    y: targetPx.y + (dy / dist) * radius,
  };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Drives a single NPC's repeating action loop.
 *
 * - No ApplianceActionController, no loading bar, no SFX.
 * - Non-talk steps use SpeechBubbleOverlay (bobbing bubble + emoji), matching Dwight's appliance UI.
 * - Talk pursuit / bilateral dialogue uses TalkHeadEmojiOverlay via NpcDialogueCoordinator.
 * - Character.update() is ticked every frame so path following works.
 * - Implements NpcDialogueSide so NpcDialogueCoordinator can pause/resume it.
 *
 * Resource contention:
 * - `applianceOccupancy` is a Set<string> (objectName) shared across all runners. When an NPC
 *   begins using an appliance, its name is added; removed when the step ends or is cancelled.
 *   If occupied, the NPC walks to a wait position near the action point and polls until free.
 * - For talk steps, if the target is already in a dialogue session the NPC walks to a wait
 *   position near the target and polls until the session ends.
 */
export class NpcActionRunner implements NpcDialogueSide {
  readonly owner: CharacterOwner;

  private readonly scene: Phaser.Scene;
  private readonly member: SpawnedCastMember;
  private readonly pathfindingSystem: PathfindingSystem;
  private readonly appliances: ApplianceInteractable[];
  private readonly chairs: Chair[];
  private readonly getCastMember: (owner: CharacterOwner) => SpawnedCastMember | null;
  private readonly onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void;
  private readonly steps: NpcActionStep[];
  private readonly coordinator: NpcDialogueCoordinator;
  /** Shared across all runners — objectName of appliances currently in use. */
  private readonly applianceOccupancy: Set<string>;

  private _active = false;
  /** True while coordinator has paused this runner as a dialogue target. */
  private _paused = false;
  /** True while a step is executing (or returning home). Blocks loop dispatch. */
  private _busy = false;
  /** True while the NPC is walking back to own chair after deactivation. */
  private _returningHome = false;
  private _loopIndex = 0;

  /** Non-null while this runner holds a slot in the shared applianceOccupancy set. */
  private _currentlyOccupiedAppliance: string | null = null;

  /**
   * Non-null while waiting for a busy resource (appliance or dialogue target).
   * The NPC has walked to a nearby wait position and is polling each frame.
   */
  private _waitState: WaitState | null = null;

  /** Bobbing speech bubble for appliance / desk / sit steps. */
  private _stepBubble: SpeechBubbleOverlay | null = null;
  private _pendingTimer: Phaser.Time.TimerEvent | null = null;

  // Talk pursuit state
  private _talkTargetOwner: CharacterOwner | null = null;
  private _talkTargetMember: SpawnedCastMember | null = null;
  private _talkDurationMs = DEFAULT_TALK_DURATION_MS;

  get isActive(): boolean { return this._active; }

  // ── NpcDialogueSide ──────────────────────────────────────────────────────

  getActor(): Character { return this.member.actor; }
  get isSitting(): boolean { return this.member.actor.isSitting; }

  constructor(
    scene: Phaser.Scene,
    member: SpawnedCastMember,
    pathfindingSystem: PathfindingSystem,
    appliances: ApplianceInteractable[],
    chairs: Chair[],
    getCastMember: (owner: CharacterOwner) => SpawnedCastMember | null,
    onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void,
    steps: NpcActionStep[],
    coordinator: NpcDialogueCoordinator,
    applianceOccupancy: Set<string>,
  ) {
    this.scene = scene;
    this.member = member;
    this.owner = member.config.owner;
    this.pathfindingSystem = pathfindingSystem;
    this.appliances = appliances;
    this.chairs = chairs;
    this.getCastMember = getCastMember;
    this.onRegisterWorldObject = onRegisterWorldObject;
    this.steps = steps;
    this.coordinator = coordinator;
    this.applianceOccupancy = applianceOccupancy;
  }

  // ── Public lifecycle ─────────────────────────────────────────────────────

  activate(): void {
    if (this._active) return;
    this._active = true;
    this._paused = false;
    this._busy = false;
    this._returningHome = false;
    this._loopIndex = 0;
    this._talkTargetOwner = null;
    this._talkTargetMember = null;
    this._waitState = null;
    this._pendingTimer?.destroy();
    this._pendingTimer = null;
    this._stepBubble?.destroy();
    this._stepBubble = null;
    this._releaseApplianceOccupancy();

    const actor = this.member.actor;
    if (actor.isSitting) {
      const ownChair = this._ownChair();
      if (ownChair) setChairOccupancy(this.chairs, ownChair.id, null);
      actor.stand();
    } else {
      actor.cancelPath();
    }
  }

  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._paused = false;

    if (this.member.actor.isSitting) {
      const ownChair = this._ownChair();
      if (ownChair?.occupiedBy === this.owner) {
        setChairOccupancy(this.chairs, ownChair.id, null);
      }
      this.member.actor.stand();
    }

    this._clearStep();
    this._walkHomeAndSit();
  }

  /** NpcDialogueSide: coordinator pauses this runner as a dialogue target. */
  pauseAsTarget(): void {
    this._clearStep();
    this._paused = true;
    this._busy = true;
  }

  /**
   * NpcDialogueSide: coordinator resumes after dialogue ends.
   * The runner restarts its current step index from scratch (predictable recovery).
   */
  resumeFromTarget(): void {
    this._paused = false;
    this._busy = false;
    // _loopIndex is intentionally unchanged so the interrupted step restarts.
  }

  /** NpcDialogueSide: coordinator calls on initiator when dialogue ends. */
  notifyTalkComplete(): void {
    this._talkTargetOwner = null;
    this._talkTargetMember = null;
    this._waitState = null;
    this._busy = false;
    this._loopIndex = (this._loopIndex + 1) % this.steps.length;
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  update(dwight: Character | null): void {
    // Always tick movement so _advancePath works, even while returning home.
    if (this._returningHome || this._active) {
      this.member.actor.update({ up: false, down: false, left: false, right: false });
    }
    if (!this._active) return;
    if (this._paused) return;

    if (this._busy) {
      if (this._talkTargetOwner !== null) {
        this._tickTalkPursuit(dwight);
      } else if (this._waitState !== null) {
        this._tickWaitState(dwight);
      }
      return;
    }

    this._dispatchStep(dwight);
  }

  /** Keep speech bubble positioned over the NPC sprite. Call each frame. */
  syncBubbles(): void {
    this._stepBubble?.syncToTarget();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _ownChair(): Chair | null {
    return findOwnedChair(this.chairs, this.owner, `${this.owner}_chair`);
  }

  private _releaseApplianceOccupancy(): void {
    if (this._currentlyOccupiedAppliance) {
      this.applianceOccupancy.delete(this._currentlyOccupiedAppliance);
      this._currentlyOccupiedAppliance = null;
    }
  }

  /**
   * Cancel current step: path, timer, bubble, wait state, appliance occupancy.
   * Does not call stand() — callers must handle that separately.
   */
  private _clearStep(): void {
    this._talkTargetOwner = null;
    this._talkTargetMember = null;
    this._waitState = null;
    this._releaseApplianceOccupancy();
    this._pendingTimer?.destroy();
    this._pendingTimer = null;
    this._stepBubble?.destroy();
    this._stepBubble = null;
    if (!this.member.actor.isSitting) {
      this.member.actor.cancelPath();
    }
  }

  private _walkHomeAndSit(): void {
    const ownChair = this._ownChair();
    if (!ownChair) return;

    const actor = this.member.actor;
    const sitPoint = nearestSitPoint(ownChair, actor.sprite.x, actor.sprite.y);
    const path = this.pathfindingSystem.findPath(
      { x: actor.sprite.x, y: actor.sprite.y },
      sitPoint.position,
    );

    this._returningHome = true;
    actor.followPath(path, () => {
      this._returningHome = false;
      if (this._active) return;
      actor.sit(sitPoint.position.x, sitPoint.position.y, sitPoint.facing);
      setChairOccupancy(this.chairs, ownChair.id, this.owner);
    });
  }

  private _dispatchStep(dwight: Character | null): void {
    const step = this.steps[this._loopIndex];
    if (!step) return;
    this._busy = true;

    switch (step.type) {
      case 'appliance':
        this._execAppliance(step.applianceName, step.durationMs ?? DEFAULT_APPLIANCE_STEP_MS);
        break;
      case 'sitAtOwnChair':
        this._execSitAtOwnChair(step.durationMs);
        break;
      case 'deskWork':
        this._execDeskWork(step.variant, step.durationMs);
        break;
      case 'talk':
        this._execTalk(step.target, step.durationMs ?? DEFAULT_TALK_DURATION_MS, dwight);
        break;
      case 'wait':
        this._execWait(step.durationMs);
        break;
    }
  }

  private _advanceLoop(): void {
    this._busy = false;
    this._loopIndex = (this._loopIndex + 1) % this.steps.length;
  }

  // ── Wait state polling ────────────────────────────────────────────────────

  /**
   * Called each frame while `_waitState` is set.
   * Once the NPC has arrived at the wait position (!isScriptedWalking), polls
   * whether the resource is free. When free, clears `_waitState` and `_busy`
   * so the next frame re-dispatches the same loop step (which will now succeed).
   */
  private _tickWaitState(dwight: Character | null): void {
    if (this.member.actor.isScriptedWalking) return;

    const ws = this._waitState!;

    if (ws.kind === 'appliance') {
      if (!this.applianceOccupancy.has(ws.applianceName)) {
        // Appliance is now free; re-dispatch this step.
        this._waitState = null;
        this._busy = false;
      }
    } else {
      // talk wait
      if (ws.targetOwner === 'dwight' && !dwight) {
        // Dwight entered car while we were waiting.
        this._waitState = null;
        this._advanceLoop();
        return;
      }
      if (!this.coordinator.isOwnerInDialogue(ws.targetOwner)) {
        // Target's dialogue ended; re-dispatch this step (will start pursuit).
        this._waitState = null;
        this._busy = false;
      }
    }
  }

  // ── Speech bubble ─────────────────────────────────────────────────────────

  /**
   * Show a bobbing speech bubble + emoji for durationMs.
   * `onDone` fires at timer expiry (not after the visual fade-out), so occupancy
   * can be released and the loop advanced immediately. The fade-out plays asynchronously.
   * Loads missing emoji PNGs on demand.
   */
  private _showSpeechBubbleAction(
    emojiTextureKey: string,
    durationMs: number,
    onDone: () => void,
  ): void {
    const run = (resolvedKey: string): void => {
      if (!this._active) return;
      this._stepBubble?.destroy();
      const overlay = SpeechBubbleOverlay.attach(this.scene, this.member.actor.sprite, {
        bubbleTextureKey: 'ui-bubble-white-1',
        emojiTextureKey: resolvedKey,
        depth: SPEECH_BUBBLE_DEPTH,
        bubbleScale: 1.5,
        verticalBobAmplitudePx: 2.5,
        verticalBobPeriodMs: 2800,
        verticalBobPhaseRad: Math.PI * 0.7,
        smoothWalkHorizontalNudge: false,
      });
      this.onRegisterWorldObject(overlay.getRoot());
      this._stepBubble = overlay;
      overlay.syncToTarget();

      this._pendingTimer = this.scene.time.delayedCall(durationMs, () => {
        if (!this._active) return;
        this._pendingTimer = null;
        // Detach from runner and let the fade play asynchronously.
        const bubble = this._stepBubble;
        this._stepBubble = null;
        bubble?.fadeOutAndDestroy();
        // Call onDone immediately (e.g. to release occupancy and advance loop).
        onDone();
      });
    };

    if (this.scene.textures.exists(emojiTextureKey)) {
      run(emojiTextureKey);
      return;
    }
    const fileStem = emojiTextureKey.startsWith('emoji16-')
      ? emojiTextureKey.slice('emoji16-'.length)
      : emojiTextureKey;
    this.scene.load.image(emojiTextureKey, `/assets/ui/emojis_16x16/${fileStem}.png`);
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (!this._active) return;
      run(this.scene.textures.exists(emojiTextureKey) ? emojiTextureKey : 'emoji16-question');
    });
    this.scene.load.start();
  }

  // ── Step executors ────────────────────────────────────────────────────────

  private _execAppliance(applianceName: string, durationMs: number): void {
    const appliance = this.appliances.find((a) => a.objectName === applianceName);
    if (!appliance) {
      this._advanceLoop();
      return;
    }

    const actor = this.member.actor;

    // ── Appliance is currently occupied by another NPC ──────────────────────
    if (this.applianceOccupancy.has(appliance.objectName)) {
      // Walk to a waiting position near (but not at) the action point.
      const waitPos = computeWaitPosition(
        appliance.position,
        { x: actor.sprite.x, y: actor.sprite.y },
        APPLIANCE_WAIT_RADIUS,
      );
      const path = this.pathfindingSystem.findPath(
        { x: actor.sprite.x, y: actor.sprite.y },
        waitPos,
      );
      if (path.length > 0) actor.followPath(path, () => {});
      this._waitState = {
        kind: 'appliance',
        applianceName: appliance.objectName,
        emoji: appliance.emoji,
        actionPoint: appliance.position,
        facing: appliance.facing,
        durationMs,
      };
      // _busy stays true; _tickWaitState will unblock when free.
      return;
    }

    // ── Appliance is free — walk to it and use it ──────────────────────────
    const path = this.pathfindingSystem.findPath(
      { x: actor.sprite.x, y: actor.sprite.y },
      appliance.position,
    );
    actor.followPath(path, () => {
      if (!this._active) return;
      actor.face(appliance.facing);
      // Claim occupancy.
      this.applianceOccupancy.add(appliance.objectName);
      this._currentlyOccupiedAppliance = appliance.objectName;
      this._showSpeechBubbleAction(
        `emoji16-${appliance.emoji}`,
        durationMs,
        () => {
          // Release occupancy immediately at timer expiry so others can use it.
          this._releaseApplianceOccupancy();
          this._advanceLoop();
        },
      );
    });
  }

  private _execSitAtOwnChair(durationMs: number): void {
    const ownChair = this._ownChair();
    if (!ownChair) { this._advanceLoop(); return; }

    if (ownChair.occupiedBy && ownChair.occupiedBy !== this.owner) {
      this._advanceLoop();
      return;
    }

    const actor = this.member.actor;
    const sitPoint = nearestSitPoint(ownChair, actor.sprite.x, actor.sprite.y);

    const startSitting = () => {
      if (!this._active) return;
      if (!actor.isSitting) {
        actor.sit(sitPoint.position.x, sitPoint.position.y, sitPoint.facing);
        setChairOccupancy(this.chairs, ownChair.id, this.owner);
      }
      this._showSpeechBubbleAction('emoji16-question', durationMs, () => {
        if (!this._active) return;
        actor.stand();
        setChairOccupancy(this.chairs, ownChair.id, null);
        this._advanceLoop();
      });
    };

    if (actor.isSitting) {
      startSitting();
    } else {
      const path = this.pathfindingSystem.findPath(
        { x: actor.sprite.x, y: actor.sprite.y },
        sitPoint.position,
      );
      actor.followPath(path, startSitting);
    }
  }

  private _execDeskWork(variant: 'computer' | 'sales_call', durationMs?: number): void {
    const ownChair = this._ownChair();
    if (!ownChair) { this._advanceLoop(); return; }

    if (ownChair.occupiedBy && ownChair.occupiedBy !== this.owner) {
      this._advanceLoop();
      return;
    }

    const cfg = DESK_WORK_CONFIG[variant];
    const dur = durationMs ?? cfg.defaultDurationMs;
    const actor = this.member.actor;
    const sitPoint = nearestSitPoint(ownChair, actor.sprite.x, actor.sprite.y);

    const startDeskWork = () => {
      if (!this._active) return;
      if (!actor.isSitting) {
        actor.sit(sitPoint.position.x, sitPoint.position.y, sitPoint.facing);
        setChairOccupancy(this.chairs, ownChair.id, this.owner);
      }
      this._showSpeechBubbleAction(cfg.emojiKey, dur, () => {
        if (!this._active) return;
        actor.stand();
        setChairOccupancy(this.chairs, ownChair.id, null);
        this._advanceLoop();
      });
    };

    if (actor.isSitting) {
      startDeskWork();
    } else {
      const path = this.pathfindingSystem.findPath(
        { x: actor.sprite.x, y: actor.sprite.y },
        sitPoint.position,
      );
      actor.followPath(path, startDeskWork);
    }
  }

  private _execTalk(
    targetOwner: CharacterOwner,
    durationMs: number,
    dwight: Character | null,
  ): void {
    if (targetOwner === 'dwight' && !dwight) {
      this._advanceLoop();
      return;
    }

    // ── Target is currently in a dialogue session ──────────────────────────
    if (this.coordinator.isOwnerInDialogue(targetOwner)) {
      const targetActor = targetOwner === 'dwight'
        ? dwight
        : this.getCastMember(targetOwner)?.actor ?? null;

      if (!targetActor) { this._advanceLoop(); return; }

      // Walk to a waiting position near (but not at) the target.
      const waitPos = computeWaitPosition(
        { x: targetActor.sprite.x, y: targetActor.sprite.y },
        { x: this.member.actor.sprite.x, y: this.member.actor.sprite.y },
        TALK_WAIT_RADIUS,
      );
      const path = this.pathfindingSystem.findPath(
        { x: this.member.actor.sprite.x, y: this.member.actor.sprite.y },
        waitPos,
      );
      if (path.length > 0) this.member.actor.followPath(path, () => {});
      this._waitState = { kind: 'talk', targetOwner, durationMs };
      // _busy stays true; _tickWaitState will unblock when session ends.
      return;
    }

    // ── Target is free — enter normal pursuit mode ─────────────────────────
    this._talkTargetOwner = targetOwner;
    this._talkDurationMs = durationMs;

    if (targetOwner === 'dwight') {
      this._talkTargetMember = null;
    } else {
      const target = this.getCastMember(targetOwner);
      if (!target) { this._advanceLoop(); return; }
      this._talkTargetMember = target;
    }

    this._startPursuitPath(dwight);
  }

  private _execWait(durationMs: number): void {
    this._pendingTimer = this.scene.time.delayedCall(durationMs, () => {
      if (!this._active) return;
      this._pendingTimer = null;
      this._advanceLoop();
    });
  }

  // ── Talk pursuit ─────────────────────────────────────────────────────────

  private _tickTalkPursuit(dwight: Character | null): void {
    const isDwightTarget = this._talkTargetOwner === 'dwight';

    if (isDwightTarget && !dwight) {
      this._talkTargetOwner = null;
      this._talkTargetMember = null;
      this._advanceLoop();
      return;
    }

    const targetActor = isDwightTarget ? dwight! : this._talkTargetMember?.actor ?? null;
    if (!targetActor) {
      this._talkTargetOwner = null;
      this._talkTargetMember = null;
      this._advanceLoop();
      return;
    }

    const dx = this.member.actor.sprite.x - targetActor.sprite.x;
    const dy = this.member.actor.sprite.y - targetActor.sprite.y;

    if (Math.sqrt(dx * dx + dy * dy) <= TALK_PURSUIT_RADIUS) {
      this.member.actor.cancelPath();
      const owner = this._talkTargetOwner!;
      const dur = this._talkDurationMs;
      this._talkTargetOwner = null;
      this._talkTargetMember = null;
      // Hand off to coordinator. If coordinator rejects (race condition), it calls
      // notifyTalkComplete on this runner to prevent a freeze.
      this.coordinator.beginDialogue(this, owner, dur);
      return;
    }

    if (!this.member.actor.isScriptedWalking) {
      this._startPursuitPath(dwight);
    }
  }

  private _startPursuitPath(dwight: Character | null): void {
    const isDwightTarget = this._talkTargetOwner === 'dwight';
    const targetActor = isDwightTarget ? dwight : this._talkTargetMember?.actor ?? null;
    if (!targetActor) return;

    const path = this.pathfindingSystem.findPath(
      { x: this.member.actor.sprite.x, y: this.member.actor.sprite.y },
      { x: targetActor.sprite.x, y: targetActor.sprite.y },
    );
    if (path.length > 0) {
      this.member.actor.followPath(path, () => {});
    }
  }
}
