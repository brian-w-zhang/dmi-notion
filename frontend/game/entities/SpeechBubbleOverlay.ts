import Phaser from 'phaser';
import { SPEECH_BUBBLE_DEPTH } from '../scenes/mainMap.constants';

/** Bottom rows of `bubble_white_*` textures used as the speaker tail (emoji centers in the band above). */
const DEFAULT_BUBBLE_TAIL_SOURCE_PX = 4;

const EMOJI_CENTER_NUDGE_DOWN_PX = 1;

/** Pushes the anchor down in world space so the tail sits a little closer to the head (not as “floating” high). */
const BUBBLE_ANCHOR_NUDGE_DOWN_PX = 10;

/** Gentle vertical bob on world Y (sine, deterministic — not random per frame). */
const DEFAULT_VERTICAL_BOB_AMPLITUDE_PX = 2.5;
const DEFAULT_VERTICAL_BOB_PERIOD_MS = 2800;

/** Extra horizontal offset while in `*-walk-left` / `*-walk-right` (eased); ± from frame-centered baseline. */
const LIMEZU_WALK_SIDE_NUDGE_TARGET_PX = 3;
/** Ignore brief `raw` walk→idle flicker from anim transitions (hold last ±nudge this many zero frames). */
const WALK_RAW_ZERO_HOLD_FRAMES = 2;
/** ~seconds to ease toward a new target; higher = less snap when flipping A/D quickly. */
const DEFAULT_WALK_HORIZONTAL_NUDGE_TAU_SEC = 0.14;

export type SpeechBubbleOverlayOptions = {
  /** Texture key loaded in Preloader (e.g. `ui-bubble-white-1`). */
  bubbleTextureKey: string;
  /** Texture key for the inner graphic (e.g. `emoji16-phone`). */
  emojiTextureKey: string;
  /**
   * Render depth. Defaults above character sprites so the bubble draws on top of the body.
   */
  depth?: number;
  /**
   * Distance from feet (sprite origin y) to top of the head frame. LimeZu sheets use 64px-tall frames.
   */
  headHeightPx?: number;
  /** Uniform scale for the bubble image. */
  bubbleScale?: number;
  /**
   * Local Y for the emoji relative to the bubble's bottom-center anchor (negative = upward into the bubble).
   * If omitted, the emoji is centered in the bubble body above the tail (see `bubbleTailSourcePx`).
   */
  emojiOffsetY?: number;
  /** Uniform scale for the emoji image. */
  emojiScale?: number;
  /**
   * Source-pixel height of the tail strip at the bottom of the bubble texture (default 4 for `bubble_white_1`).
   * Used only when `emojiOffsetY` is omitted.
   */
  bubbleTailSourcePx?: number;
  /** Max vertical offset in world px (sine peaks at ±this). `0` turns bob off. */
  verticalBobAmplitudePx?: number;
  /** One full up–down–up cycle duration in ms. */
  verticalBobPeriodMs?: number;
  /** Phase offset in radians so multiple bubbles are not perfectly in sync. */
  verticalBobPhaseRad?: number;
  /**
   * Ease horizontal position toward a walk left/right sheet correction (avoids instant snap / jitter
   * when changing direction fast). Idle target is 0.
   */
  smoothWalkHorizontalNudge?: boolean;
  /** Time constant (seconds) for easing toward the walk nudge target. */
  walkHorizontalNudgeTauSec?: number;
  /**
   * World X offset added to `sprite.x` before walk easing — use when the visual head isn’t on texture
   * origin 0.5 (idle baseline). Walk correction still layers on top of this.
   */
  horizontalFrameBiasPx?: number;
};

/**
 * World-space bubble + emoji above a sprite’s head.
 * After construction, pass `getRoot()` to `MainMapHud.ignoreWorldObjects` so only `cameras.main` draws it
 * (otherwise the HUD ui camera also renders it at a wrong scroll offset).
 */
const ACTION_BUBBLE_FADE_UP_PX = 28;
const ACTION_BUBBLE_FADE_DURATION_MS = 1100;

export class SpeechBubbleOverlay {
  private readonly scene: Phaser.Scene;
  private readonly target: Phaser.GameObjects.Sprite;
  private readonly root: Phaser.GameObjects.Container;
  private readonly bubbleImage: Phaser.GameObjects.Image;
  private readonly emojiImage: Phaser.GameObjects.Image;
  private readonly headHeightPx: number;
  private readonly liftAboveHeadPx: number;
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
    headHeightPx: number,
    liftAboveHeadPx: number,
    root: Phaser.GameObjects.Container,
    bubbleImage: Phaser.GameObjects.Image,
    emojiImage: Phaser.GameObjects.Image,
    opts: {
      verticalBob: { amplitudePx: number; periodMs: number; phaseRad: number };
      smoothWalkHorizontalNudge: boolean;
      walkHorizontalNudgeTauSec: number;
      horizontalFrameBiasPx: number;
    }
  ) {
    this.scene = scene;
    this.target = target;
    this.headHeightPx = headHeightPx;
    this.liftAboveHeadPx = liftAboveHeadPx;
    this.root = root;
    this.bubbleImage = bubbleImage;
    this.emojiImage = emojiImage;
    this.verticalBobAmplitudePx = opts.verticalBob.amplitudePx;
    this.verticalBobPeriodMs = opts.verticalBob.periodMs;
    this.verticalBobPhaseRad = opts.verticalBob.phaseRad;
    this.smoothWalkHorizontalNudge = opts.smoothWalkHorizontalNudge;
    this.walkHorizontalNudgeTauSec = opts.walkHorizontalNudgeTauSec;
    this.horizontalFrameBiasPx = opts.horizontalFrameBiasPx;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  getRoot(): Phaser.GameObjects.Container {
    return this.root;
  }

  static attach(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
    options: SpeechBubbleOverlayOptions,
    liftAboveHeadPx = 2
  ): SpeechBubbleOverlay {
    const {
      bubbleTextureKey,
      emojiTextureKey,
      depth = SPEECH_BUBBLE_DEPTH,
      headHeightPx = 64,
      bubbleScale = 1.5,
      emojiOffsetY: emojiOffsetYOverride,
      emojiScale = 1,
      bubbleTailSourcePx = DEFAULT_BUBBLE_TAIL_SOURCE_PX,
      verticalBobAmplitudePx = DEFAULT_VERTICAL_BOB_AMPLITUDE_PX,
      verticalBobPeriodMs = DEFAULT_VERTICAL_BOB_PERIOD_MS,
      verticalBobPhaseRad = 0,
      smoothWalkHorizontalNudge = false,
      walkHorizontalNudgeTauSec = DEFAULT_WALK_HORIZONTAL_NUDGE_TAU_SEC,
      horizontalFrameBiasPx = 0,
    } = options;

    const root = scene.add.container(0, 0);

    const bubble = scene.add
      .image(0, 0, bubbleTextureKey)
      .setOrigin(0.5, 1)
      .setScale(bubbleScale);

    const emojiOffsetY =
      emojiOffsetYOverride !== undefined
        ? emojiOffsetYOverride
        : computeEmojiCenterYForBubbleBody(bubble, bubbleTailSourcePx);

    const emoji = scene.add
      .image(0, emojiOffsetY, emojiTextureKey)
      .setOrigin(0.5, 0.5)
      .setScale(emojiScale);

    root.add([bubble, emoji]);
    root.setDepth(depth);

    const overlay = new SpeechBubbleOverlay(
      scene,
      target,
      headHeightPx,
      liftAboveHeadPx,
      root,
      bubble,
      emoji,
      {
      verticalBob: {
        amplitudePx: verticalBobAmplitudePx,
        periodMs: verticalBobPeriodMs,
        phaseRad: verticalBobPhaseRad,
      },
      smoothWalkHorizontalNudge,
      walkHorizontalNudgeTauSec,
      horizontalFrameBiasPx,
      }
    );
    overlay.syncToTarget();
    return overlay;
  }

  /** World Y of the top edge of the bubble (for stacking e.g. a progress bar above it). */
  getBubbleTopWorldY(): number {
    return this.root.y - this.bubbleImage.displayHeight;
  }

  setEmojiTextureKey(textureKey: string): void {
    if (this.scene.textures.exists(textureKey)) {
      this.emojiImage.setTexture(textureKey);
    }
  }

  /**
   * Stops following the sprite, floats up and fades out, then destroys this overlay.
   * Used when an appliance action completes (replaces the old “emoji pops at feet” beat).
   */
  fadeOutAndDestroy(onComplete?: () => void): void {
    if (this.followSuspended) return;
    this.followSuspended = true;
    this.exitTween?.stop();
    this.exitTween = this.scene.tweens.add({
      targets: this.root,
      y: this.root.y - ACTION_BUBBLE_FADE_UP_PX,
      alpha: 0,
      duration: ACTION_BUBBLE_FADE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.exitTween = null;
        this.destroy();
        onComplete?.();
      },
    });
  }

  /** Keep the stack locked to the character head. */
  syncToTarget(): void {
    if (this.followSuspended) return;
    const t = this.target;
    if (!t.active) return;

    const headY = t.y - this.headHeightPx;
    const baseY = headY - this.liftAboveHeadPx + BUBBLE_ANCHOR_NUDGE_DOWN_PX;
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
        const alpha = tau > 0 ? 1 - Math.exp(-(dtMs / 1000) / tau) : 1;
        this.smoothedWalkNudgeX += (debounced - this.smoothedWalkNudgeX) * alpha;
      }
      this.prevDebouncedWalkTarget = debounced;
      extraX = this.smoothedWalkNudgeX;
    }

    this.root.setPosition(t.x + this.horizontalFrameBiasPx + extraX, baseY + bobY);
  }

  destroy(): void {
    this.exitTween?.stop();
    this.exitTween = null;
    this.root.destroy(true);
  }
}

/** Vertical center of the bubble body (texture minus bottom `tailPx`), origin bottom-center. */
function computeEmojiCenterYForBubbleBody(
  bubble: Phaser.GameObjects.Image,
  tailPx: number
): number {
  const sourceH = bubble.frame.height;
  const h = bubble.displayHeight;
  const yTop = -h;
  const yBodyBottom = -(tailPx / sourceH) * h;
  return (yTop + yBodyBottom) / 2 + EMOJI_CENTER_NUDGE_DOWN_PX;
}

function limeZuWalkHorizontalNudgeTargetPx(sprite: Phaser.GameObjects.Sprite): number {
  const key = sprite.anims.currentAnim?.key ?? '';
  if (!key.includes('-walk-')) return 0;
  if (key.endsWith('-left')) return -LIMEZU_WALK_SIDE_NUDGE_TARGET_PX;
  if (key.endsWith('-right')) return LIMEZU_WALK_SIDE_NUDGE_TARGET_PX;
  return 0;
}
