import Phaser from 'phaser';
import { SPEECH_BUBBLE_DEPTH } from '../scenes/mainMap.constants';

/**
 * Talk affordance: single emoji (no speech bubble), offset to the right and lower than
 * `SpeechBubbleOverlay` so it sits nearer the head and does not stack with action bubbles.
 */
/** Extra horizontal offset while in `*-walk-left` / `*-walk-right` (eased). */
const LIMEZU_WALK_SIDE_NUDGE_TARGET_PX = 3;
const WALK_RAW_ZERO_HOLD_FRAMES = 2;
const DEFAULT_WALK_HORIZONTAL_NUDGE_TAU_SEC = 0.14;

const DEFAULT_VERTICAL_BOB_AMPLITUDE_PX = 2.5;
const DEFAULT_VERTICAL_BOB_PERIOD_MS = 2800;

const ACTION_EMOJI_FADE_UP_PX = 28;
const ACTION_EMOJI_FADE_DURATION_MS = 1100;

export type TalkHeadEmojiOverlayOptions = {
  emojiTextureKey?: string;
  depth?: number;
  /** Uniform scale (matches in-bubble emoji scale in `SpeechBubbleOverlay`). */
  scale?: number;
  alpha?: number;
  verticalBobAmplitudePx?: number;
  verticalBobPeriodMs?: number;
  verticalBobPhaseRad?: number;
  smoothWalkHorizontalNudge?: boolean;
  walkHorizontalNudgeTauSec?: number;
  horizontalFrameBiasPx?: number;
  /**
   * World-space offset from the sprite feet position (`sprite.x`, `sprite.y`).
   * Positive X = right; negative Y = up. Defaults sit the emoji beside the upper head.
   */
  offsetX?: number;
  offsetYFromFeet?: number;
};

export class TalkHeadEmojiOverlay {
  private readonly scene: Phaser.Scene;
  private readonly target: Phaser.GameObjects.Sprite;
  private readonly image: Phaser.GameObjects.Image;
  private readonly offsetX: number;
  private readonly offsetYFromFeet: number;
  private readonly verticalBobAmplitudePx: number;
  private readonly verticalBobPeriodMs: number;
  private readonly verticalBobPhaseRad: number;
  private readonly smoothWalkHorizontalNudge: boolean;
  private readonly walkHorizontalNudgeTauSec: number;
  private readonly horizontalFrameBiasPx: number;
  private smoothedWalkNudgeX = 0;
  private prevDebouncedWalkTarget = 0;
  private walkRawZeroStreak = 0;
  private lastNonZeroWalkRaw = 0;
  private followSuspended = false;
  private exitTween: Phaser.Tweens.Tween | null = null;

  private constructor(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
    image: Phaser.GameObjects.Image,
    opts: {
      offsetX: number;
      offsetYFromFeet: number;
      verticalBob: { amplitudePx: number; periodMs: number; phaseRad: number };
      smoothWalkHorizontalNudge: boolean;
      walkHorizontalNudgeTauSec: number;
      horizontalFrameBiasPx: number;
    }
  ) {
    this.scene = scene;
    this.target = target;
    this.image = image;
    this.offsetX = opts.offsetX;
    this.offsetYFromFeet = opts.offsetYFromFeet;
    this.verticalBobAmplitudePx = opts.verticalBob.amplitudePx;
    this.verticalBobPeriodMs = opts.verticalBob.periodMs;
    this.verticalBobPhaseRad = opts.verticalBob.phaseRad;
    this.smoothWalkHorizontalNudge = opts.smoothWalkHorizontalNudge;
    this.walkHorizontalNudgeTauSec = opts.walkHorizontalNudgeTauSec;
    this.horizontalFrameBiasPx = opts.horizontalFrameBiasPx;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  static attach(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
    options: TalkHeadEmojiOverlayOptions = {}
  ): TalkHeadEmojiOverlay {
    const {
      emojiTextureKey = 'emoji16-talk',
      depth = SPEECH_BUBBLE_DEPTH,
      scale = 1.5,
      alpha = 1,
      verticalBobAmplitudePx = DEFAULT_VERTICAL_BOB_AMPLITUDE_PX,
      verticalBobPeriodMs = DEFAULT_VERTICAL_BOB_PERIOD_MS,
      verticalBobPhaseRad = Math.PI * 0.7,
      smoothWalkHorizontalNudge = true,
      walkHorizontalNudgeTauSec = DEFAULT_WALK_HORIZONTAL_NUDGE_TAU_SEC,
      horizontalFrameBiasPx = 0,
      offsetX = 14,
      offsetYFromFeet = -48,
    } = options;

    const key = scene.textures.exists(emojiTextureKey) ? emojiTextureKey : 'emoji16-question';
    const image = scene.add
      .image(0, 0, key)
      .setOrigin(0.5, 0.5)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(depth);

    const overlay = new TalkHeadEmojiOverlay(scene, target, image, {
      offsetX,
      offsetYFromFeet,
      verticalBob: {
        amplitudePx: verticalBobAmplitudePx,
        periodMs: verticalBobPeriodMs,
        phaseRad: verticalBobPhaseRad,
      },
      smoothWalkHorizontalNudge,
      walkHorizontalNudgeTauSec,
      horizontalFrameBiasPx,
    });
    overlay.syncToTarget();
    return overlay;
  }

  getRoot(): Phaser.GameObjects.Image {
    return this.image;
  }

  /** Top edge of the emoji in world space (for stacking UI above it). */
  getBubbleTopWorldY(): number {
    return this.image.y - this.image.displayHeight / 2;
  }

  syncToTarget(): void {
    if (this.followSuspended) return;
    const t = this.target;
    if (!t.active) return;

    const bobY =
      this.verticalBobAmplitudePx > 0 && this.verticalBobPeriodMs > 0
        ? Math.sin(
            (this.scene.time.now / this.verticalBobPeriodMs) * Math.PI * 2 +
              this.verticalBobPhaseRad
          ) * this.verticalBobAmplitudePx
        : 0;

    let extraX = 0;
    if (this.smoothWalkHorizontalNudge) {
      const raw = limeZuWalkHorizontalNudgeTargetPx(this.target);
      if (raw !== 0) {
        this.walkRawZeroStreak = 0;
        this.lastNonZeroWalkRaw = raw;
      } else {
        this.walkRawZeroStreak += 1;
      }

      const debounced =
        raw !== 0
          ? raw
          : this.walkRawZeroStreak <= WALK_RAW_ZERO_HOLD_FRAMES && this.lastNonZeroWalkRaw !== 0
            ? this.lastNonZeroWalkRaw
            : 0;

      const enteredWalk = this.prevDebouncedWalkTarget === 0 && debounced !== 0;
      if (enteredWalk) {
        this.smoothedWalkNudgeX = debounced;
      } else {
        const dtMs = Math.max(0, Math.min(this.scene.game.loop.delta, 80));
        const tau = this.walkHorizontalNudgeTauSec;
        const a = tau > 0 ? 1 - Math.exp(-(dtMs / 1000) / tau) : 1;
        this.smoothedWalkNudgeX += (debounced - this.smoothedWalkNudgeX) * a;
      }
      this.prevDebouncedWalkTarget = debounced;
      extraX = this.smoothedWalkNudgeX;
    }

    this.image.setPosition(
      t.x + this.horizontalFrameBiasPx + this.offsetX + extraX,
      t.y + this.offsetYFromFeet + bobY
    );
  }

  fadeOutAndDestroy(onComplete?: () => void): void {
    if (this.followSuspended) return;
    this.followSuspended = true;
    this.exitTween?.stop();
    this.exitTween = this.scene.tweens.add({
      targets: this.image,
      y: this.image.y - ACTION_EMOJI_FADE_UP_PX,
      alpha: 0,
      duration: ACTION_EMOJI_FADE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.exitTween = null;
        this.destroy();
        onComplete?.();
      },
    });
  }

  destroy(): void {
    this.exitTween?.stop();
    this.exitTween = null;
    this.image.destroy();
  }
}

function limeZuWalkHorizontalNudgeTargetPx(sprite: Phaser.GameObjects.Sprite): number {
  const key = sprite.anims.currentAnim?.key ?? '';
  if (!key.includes('-walk-')) return 0;
  if (key.endsWith('-left')) return -LIMEZU_WALK_SIDE_NUDGE_TARGET_PX;
  if (key.endsWith('-right')) return LIMEZU_WALK_SIDE_NUDGE_TARGET_PX;
  return 0;
}
