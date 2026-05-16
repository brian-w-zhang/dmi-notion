import Phaser from 'phaser';
import type { Character } from '../entities/Character';
import { facingTowardWorldPoint } from '../entities/Character';
import type { CharacterOwner } from '../config/characters';
import { TalkHeadEmojiOverlay } from '../entities/TalkHeadEmojiOverlay';

const TALK_EMOJI_KEY = 'emoji16-talk';

// ─── Interface NpcActionRunner implements so Coordinator avoids circular import ─

/**
 * The subset of NpcActionRunner that NpcDialogueCoordinator interacts with.
 * Defined here so coordinator doesn't need to import the runner class directly.
 */
export interface NpcDialogueSide {
  readonly owner: CharacterOwner;
  getActor(): Character;
  readonly isSitting: boolean;
  /** Coordinator calls this on the TARGET when dialogue begins: stops current step. */
  pauseAsTarget(): void;
  /** Coordinator calls this on the TARGET when dialogue ends: restarts interrupted step. */
  resumeFromTarget(): void;
  /**
   * Coordinator calls this on the INITIATOR when dialogue ends: advance loop index.
   * Also called on both sides when `cancelAll()` aborts mid-session.
   */
  notifyTalkComplete(): void;
}

// ─── Session state ──────────────────────────────────────────────────────────

interface DialogueSession {
  initiator: NpcDialogueSide;
  /** null when the target is player-controlled Dwight. */
  target: NpcDialogueSide | null;
  /** non-null only when Dwight is the target. */
  dwightTarget: Character | null;
  initiatorEmoji: TalkHeadEmojiOverlay | null;
  targetEmoji: TalkHeadEmojiOverlay | null;
  timerEvent: Phaser.Time.TimerEvent | null;
}

// ─── Coordinator ────────────────────────────────────────────────────────────

/**
 * Owns bilateral NPC dialogue sessions.
 *
 * - NPC ↔ NPC:   both runners are paused; mutual emoji; both resume on end.
 * - NPC ↔ Dwight: NPC emoji shown; Dwight's action queue + appliance controller
 *                 are cleared via `onDwightInterrupt` (same as entering car);
 *                 Dwight stays player-controlled but receives facing sync.
 *
 * At most one session is active at a time.
 */
export class NpcDialogueCoordinator {
  private readonly scene: Phaser.Scene;
  private readonly getRunner: (owner: CharacterOwner) => NpcDialogueSide | undefined;
  private readonly getDwight: () => Character | null;
  /** Clears Dwight's action queue and stops current appliance action. */
  private readonly onDwightInterrupt: () => void;
  private readonly onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void;

  private _session: DialogueSession | null = null;

  constructor(
    scene: Phaser.Scene,
    getRunner: (owner: CharacterOwner) => NpcDialogueSide | undefined,
    getDwight: () => Character | null,
    onDwightInterrupt: () => void,
    onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void,
  ) {
    this.scene = scene;
    this.getRunner = getRunner;
    this.getDwight = getDwight;
    this.onDwightInterrupt = onDwightInterrupt;
    this.onRegisterWorldObject = onRegisterWorldObject;
  }

  /** True if the given owner is currently participating in an active dialogue session. */
  isOwnerInDialogue(owner: CharacterOwner): boolean {
    if (!this._session) return false;
    if (this._session.initiator.owner === owner) return true;
    if (this._session.target?.owner === owner) return true;
    // 'dwight' as a CharacterOwner — matched via null-target + Dwight presence
    if (!this._session.target && owner === 'dwight' && this._session.dwightTarget !== null) return true;
    return false;
  }

  /**
   * Begin a mutual dialogue.
   * - If `targetOwner === 'dwight'` and Dwight is not on foot, silently skips
   *   (calls notifyTalkComplete on initiator so the loop advances).
   * - At most one session runs at a time.
   * - If a session is already active (race condition: two NPCs reached their
   *   targets on the same frame), notifyTalkComplete is called on the initiator
   *   so they advance their loop rather than freezing with _busy = true.
   */
  beginDialogue(
    initiator: NpcDialogueSide,
    targetOwner: CharacterOwner,
    durationMs: number,
  ): void {
    if (this._session) {
      // Race condition: another session started since we last checked isOwnerInDialogue.
      // Advance the initiator so their loop can continue.
      initiator.notifyTalkComplete();
      return;
    }

    const isDwightTarget = targetOwner === 'dwight';
    const targetRunner = isDwightTarget ? null : this.getRunner(targetOwner);
    const dwight = isDwightTarget ? this.getDwight() : null;

    // Skip: Dwight is in the car
    if (isDwightTarget && !dwight) {
      initiator.notifyTalkComplete();
      return;
    }

    // ── Apply facings ──────────────────────────────────────────────────────

    const initiatorSprite = initiator.getActor().sprite;
    const targetSprite = isDwightTarget
      ? dwight!.sprite
      : targetRunner?.getActor().sprite;

    if (targetSprite) {
      if (!initiator.isSitting) {
        initiator.getActor().face(
          facingTowardWorldPoint(initiatorSprite.x, initiatorSprite.y, targetSprite.x, targetSprite.y),
        );
      }
      if (targetRunner && !targetRunner.isSitting) {
        targetRunner.getActor().face(
          facingTowardWorldPoint(targetSprite.x, targetSprite.y, initiatorSprite.x, initiatorSprite.y),
        );
      } else if (isDwightTarget && dwight && !dwight.isSitting) {
        dwight.face(
          facingTowardWorldPoint(targetSprite.x, targetSprite.y, initiatorSprite.x, initiatorSprite.y),
        );
      }
    }

    // ── Pause / interrupt the target ──────────────────────────────────────

    if (targetRunner) {
      targetRunner.pauseAsTarget();
    } else if (isDwightTarget) {
      this.onDwightInterrupt();
    }

    // ── Emoji overlays ────────────────────────────────────────────────────

    const initiatorEmoji = TalkHeadEmojiOverlay.attach(this.scene, initiatorSprite, {
      emojiTextureKey: TALK_EMOJI_KEY,
      smoothWalkHorizontalNudge: false,
    });
    this.onRegisterWorldObject(initiatorEmoji.getRoot());

    let targetEmoji: TalkHeadEmojiOverlay | null = null;
    if (targetSprite) {
      targetEmoji = TalkHeadEmojiOverlay.attach(this.scene, targetSprite, {
        emojiTextureKey: TALK_EMOJI_KEY,
        smoothWalkHorizontalNudge: false,
        verticalBobPhaseRad: Math.PI * 0.3,
      });
      this.onRegisterWorldObject(targetEmoji.getRoot());
    }

    // ── Build session ─────────────────────────────────────────────────────

    const session: DialogueSession = {
      initiator,
      target: targetRunner ?? null,
      dwightTarget: dwight,
      initiatorEmoji,
      targetEmoji,
      timerEvent: null,
    };
    this._session = session;

    session.timerEvent = this.scene.time.delayedCall(durationMs, () => {
      this._endSession(session);
    });
  }

  /**
   * Call each frame while simulation is active.
   * Keeps facing synced and emoji positions updated during active sessions.
   */
  tick(dwight: Character | null): void {
    const session = this._session;
    if (!session) return;

    const initiatorActor = session.initiator.getActor();
    const targetSprite = session.dwightTarget
      ? session.dwightTarget.sprite
      : session.target?.getActor().sprite;

    if (targetSprite) {
      // Standing characters face each other; seated characters keep sit-facing.
      if (!session.initiator.isSitting) {
        initiatorActor.face(
          facingTowardWorldPoint(
            initiatorActor.sprite.x, initiatorActor.sprite.y,
            targetSprite.x, targetSprite.y,
          ),
        );
      }
      if (session.target && !session.target.isSitting) {
        const ta = session.target.getActor();
        ta.face(
          facingTowardWorldPoint(
            targetSprite.x, targetSprite.y,
            initiatorActor.sprite.x, initiatorActor.sprite.y,
          ),
        );
      } else if (session.dwightTarget && dwight && !dwight.isSitting) {
        dwight.face(
          facingTowardWorldPoint(
            targetSprite.x, targetSprite.y,
            initiatorActor.sprite.x, initiatorActor.sprite.y,
          ),
        );
      }
    }

    session.initiatorEmoji?.syncToTarget();
    session.targetEmoji?.syncToTarget();
  }

  /**
   * Abort any active session without natural completion.
   * Used when simulation is deactivated or the car is entered.
   */
  cancelAll(): void {
    const session = this._session;
    if (!session) return;
    this._session = null;
    session.timerEvent?.destroy();
    session.initiatorEmoji?.destroy();
    session.targetEmoji?.destroy();
    // Restore both sides so they don't hang in a paused/busy state
    session.target?.resumeFromTarget();
    session.initiator.notifyTalkComplete();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _endSession(session: DialogueSession): void {
    if (this._session !== session) return;
    this._session = null;
    session.timerEvent?.destroy();
    session.initiatorEmoji?.fadeOutAndDestroy();
    session.targetEmoji?.fadeOutAndDestroy();
    // Target restarts its interrupted step from the beginning (predictable recovery).
    session.target?.resumeFromTarget();
    // Initiator advances its loop past the talk step.
    session.initiator.notifyTalkComplete();
  }
}
