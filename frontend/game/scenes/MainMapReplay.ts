import Phaser from 'phaser';
import { CHARACTER_ASSETS } from '../config/characters';
import { registerAnimations } from '../systems/AnimationRegistry';
import type { MainMapHud } from './mainMapHud';

// ── Types ─────────────────────────────────────────────────────────────────────

type Facing   = 'front' | 'back' | 'left' | 'right';
type AnimBase = 'walk' | 'idle' | 'sit';

interface CharReplayState {
  x:          number;
  y:          number;
  facing:     Facing;
  anim:       AnimBase;
  visible:    boolean;
  action?:    string;
  emoji?:     string;
  currently?: string;
  state?:     string;
  needs?:     Record<string, number>;
  pad?:       { pleasure: number; arousal: number; dominance: number };
  thinking?:  string;
}

interface SfxEvent {
  key?:      string;
  volume?:   number;
  rate?:     number;
  detune?:   number;
  loop?:     boolean;
  stopLoop?: string;
}

interface ActiveConvSnapshot {
  id:           string;
  participants: [string, string];
  location:     string;
  turns:        { speaker: string; line: string; tone?: string }[];
}

interface SimReplayStep {
  step:                number;
  sim_time?:           string;
  emoji?:              string;
  desc?:               string;
  follow?:             string;
  chars:               Record<string, CharReplayState>;
  sfx?:                SfxEvent[];
  conversations?:      object[];
  activeConversations?: ActiveConvSnapshot[];
  announcements?:      { from: string; message: string }[];
  events?:             object[];
}

interface ReplayMeta {
  ms_per_step:     number;
  sec_per_step?:   number;
  sim_code?:       string;
  start_sim_time?: string;
  characters:      string[];
}

interface ReplayFile {
  meta:  ReplayMeta;
  steps: SimReplayStep[];
}

// ── Entrance sequence pixel coords (mirrors mainMap.constants.ts defaults) ────
// When a character transitions commuting → active, the frontend plays this
// scripted sequence before resuming step-driven movement — exactly what the
// sandbox withEntranceIfNeeded() does.
const ENTRANCE_START  = { x: 977.5,  y: 1774.55 };
const ENTRANCE_END    = { x: 978.67, y: 1652.74 };
const ELEVATOR_START  = { x: 767.72, y: 894.976 };
const ELEVATOR_END    = { x: 768.06, y: 776.418 };
const ENTRANCE_WALK_SPEED_PX_S = 90;   // NPC_WALK_SPEED (1.5 px/frame × 60fps)

// ── Sprite key lookup ─────────────────────────────────────────────────────────

const SPRITE_KEY: Record<string, string> = Object.fromEntries(
  CHARACTER_ASSETS.map(a => [a.owner, a.spriteKey])
);

// ── Controller ────────────────────────────────────────────────────────────────

const CHAR_DEPTH          = 17;
const SPEECH_BUBBLE_DEPTH = 10000;
const INSPECT_WIDTH   = 420;
const INSPECT_PANEL_H = 560;  // fixed height — panel anchors to bottom-left
const INSPECT_MARGIN  = 12;
const POV_WIDTH       = 160;  // camera picker is narrower than the inspect panel
const POV_H           = 30;   // collapsed POV picker height
const POV_ITEM_H      = 22;   // each dropdown row height
const POV_GAP         = 4;    // gap between POV picker and inspect panel

export class MainMapReplayController {
  private readonly replay: ReplayFile;
  private stepIdx = 0;
  private paused  = false;
  private stepTimer!: Phaser.Time.TimerEvent;

  private sprites      = new Map<string, Phaser.GameObjects.Sprite>();
  // Speech bubbles: same white-bubble + emoji-text as sandbox ApplianceActionController.
  // Per-frame sync via update() keeps the bubble glued to the sprite during tweens.
  private emojiBubbles = new Map<string, { root: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; lastEmoji: string }>();
  // Talk overlays: emoji16-talk sprite shown while character state === 'in_conversation'.
  // Same pattern as sandbox TalkHeadEmojiOverlay: x+14, y-48, scale 1.5, depth 10000.
  private talkOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  // Dialogue text labels: dark-bg floating text showing last spoken line above talking chars.
  private speechLabels = new Map<string, { container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; header: Phaser.GameObjects.Text; text: Phaser.GameObjects.Text; lastLine: string }>();
  // Conversation connector: dashed line drawn between each talking pair each step.
  private convLines!: Phaser.GameObjects.Graphics;

  // Entrance sequence tracking
  // prevCharStates: last known state per character, used to detect commuting → active.
  // entranceInProgress: characters currently running the scripted entrance animation;
  //   step-driven position updates are suppressed for them until the sequence completes.
  private prevCharStates     = new Map<string, string>();
  private entranceInProgress = new Set<string>();

  // Active looping SFX
  private activeLoop:    Phaser.Sound.BaseSound | null = null;
  private activeLoopKey: string | null = null;

  // POV picker
  private _povKey:       string | null = null;
  private _povOpen       = false;
  private _povContainer!: Phaser.GameObjects.Container;

  // Inspect panel
  private inspectKey:   string | null = null;
  private inspectPanel!: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hud:   MainMapHud,
    data?: ReplayFile,
  ) {
    this.replay = data ?? (scene.cache.json.get('replay') as ReplayFile);
  }

  get isValid(): boolean {
    return !!(this.replay?.steps?.length);
  }

  get isPaused(): boolean { return this.paused; }

  pause():       void { this.paused = true;  }
  resume():      void { this.paused = false; }
  togglePause(): void {
    this.paused = !this.paused;
    this.hud.setPlayPaused(this.paused);
  }

  skipSteps(n: number): void { this.seekTo(this.stepIdx + n); }

  private _setSpeed(mult: number): void {
    if (!this.stepTimer) return;
    this.stepTimer.remove(false);
    this.stepTimer = this.scene.time.addEvent({
      delay:         this.replay.meta.ms_per_step / mult,
      loop:          true,
      callback:      this._tick,
      callbackScope: this,
    });
  }

  seekTo(idx: number): void {
    const clamped = Phaser.Math.Clamp(idx, 0, this.replay.steps.length - 1);
    this.scene.tweens.killAll();
    this._applyStep(this.replay.steps[clamped], true);
    this.stepIdx = clamped + 1;
    const s = this.replay.steps[clamped];
    this.hud.setReplayStatus(s.emoji ?? '🏢', s.sim_time ?? s.desc ?? '', s.step, this.replay.steps.length - 1, this.paused);
  }

  // ── Start ───────────────────────────────────────────────────────────────────

  start(): void {
    const { steps, meta } = this.replay;
    if (!steps.length) return;

    this._spawnSprites(steps[0]);
    this.convLines = this.scene.add.graphics().setDepth(CHAR_DEPTH + 1);
    this.hud.ignoreWorldObjects(this.convLines);
    this._buildPovPicker();
    this._buildInspectPanel();
    this._applyStep(steps[0], true);
    this.stepIdx = 1;

    this.hud.enterReplayMode(steps.length - 1, meta.ms_per_step, {
      onPlayPause:   () => this.togglePause(),
      onSeek:        idx => this.seekTo(idx),
      onSkip:        n   => this.skipSteps(n),
      onSpeedChange: mult => this._setSpeed(mult),
    });
    const s0 = steps[0];
    this.hud.setReplayStatus(s0.emoji ?? '🏢', s0.sim_time ?? s0.desc ?? '', 0, steps.length - 1, false);

    this.scene.time.delayedCall(400, () => {
      this.stepTimer = this.scene.time.addEvent({
        delay:         meta.ms_per_step,
        loop:          true,
        callback:      this._tick,
        callbackScope: this,
      });
    });

    // Camera — start at parking lot entrance; user picks POV via the picker
    const cam = this.scene.cameras.main;
    cam.setLerp(0.08, 0.08);
    cam.centerOn(2714, 1442);

    // Drag-to-pan in free camera mode (same pattern as sandbox)
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this._povKey !== null) return;
      const dx = (pointer.x - pointer.prevPosition.x) / cam.zoom;
      const dy = (pointer.y - pointer.prevPosition.y) / cam.zoom;
      cam.setScroll(cam.scrollX - dx, cam.scrollY - dy);
    });
  }

  destroy(): void {
    this.stepTimer?.remove(false);
    this.sprites.forEach(s => s.destroy());
    this.sprites.clear();
    this.emojiBubbles.forEach(b => b.root.destroy(true));
    this.emojiBubbles.clear();
    this.talkOverlays.forEach(s => s.destroy());
    this.talkOverlays.clear();
    this.speechLabels.forEach(l => l.container.destroy(true));
    this.speechLabels.clear();
    this.convLines?.destroy();
    this.entranceInProgress.clear();
    this.prevCharStates.clear();
    this.activeLoop?.stop();
    this.activeLoop = null;
    this._povContainer?.destroy();
    this.inspectPanel?.destroy();
  }

  /** Called every frame from the scene update loop to keep speech bubbles pinned to sprites. */
  update(): void {
    for (const [key, bubble] of this.emojiBubbles) {
      if (!bubble.root.visible) continue;
      const sprite = this.sprites.get(key);
      if (sprite) bubble.root.setPosition(sprite.x, sprite.y - 56);
    }
    for (const [key, overlay] of this.talkOverlays) {
      if (!overlay.visible) continue;
      const sprite = this.sprites.get(key);
      if (sprite) overlay.setPosition(sprite.x + 14, sprite.y - 48);
    }
    for (const [key, label] of this.speechLabels) {
      if (!label.container.visible) continue;
      const sprite = this.sprites.get(key);
      if (sprite) label.container.setPosition(sprite.x, sprite.y - 104);
    }
  }

  // ── Spawn characters ─────────────────────────────────────────────────────────

  private _spawnSprites(step: SimReplayStep): void {
    for (const key of Object.keys(step.chars)) {
      if (this.sprites.has(key)) continue;
      const spriteKey = SPRITE_KEY[key];
      if (!spriteKey) continue;

      registerAnimations(this.scene, spriteKey);

      const c = step.chars[key];
      const sprite = this.scene.add.sprite(c.x, c.y, spriteKey);
      sprite.setDepth(CHAR_DEPTH);
      sprite.setOrigin(0.5, 1);
      sprite.setVisible(c.visible);
      sprite.setInteractive();
      sprite.on('pointerdown', () => this._selectChar(key));
      this.hud.ignoreWorldObjects(sprite);
      this.sprites.set(key, sprite);

      // Speech bubble — same white-bubble image as sandbox, emoji rendered as unicode text.
      // The bubble image is 32×32 at scale 1.5 (48×48 display), origin (0.5,1).
      // Emoji body-center sits at y=-26 inside the container (above the 4px tail).
      // Container root is positioned at sprite.y-56 each frame via update().
      const bubbleRoot = this.scene.add.container(c.x, c.y - 56);
      const bubbleBg   = this.scene.add.image(0, 0, 'ui-bubble-white-1')
        .setOrigin(0.5, 1).setScale(1.5);
      const emojiText  = this.scene.add.text(0, -26, '', {
        fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif',
        fontSize: '13px',
      }).setOrigin(0.5, 0.5);
      bubbleRoot.add([bubbleBg, emojiText]);
      bubbleRoot.setDepth(CHAR_DEPTH + 2).setVisible(false);
      this.hud.ignoreWorldObjects(bubbleRoot);
      this.emojiBubbles.set(key, { root: bubbleRoot, text: emojiText, lastEmoji: '' });

      // Talk overlay — emoji16-talk, same position as sandbox: x+14, y-48, scale 1.5
      if (this.scene.textures.exists('emoji16-talk')) {
        const talkOverlay = this.scene.add.sprite(c.x + 14, c.y - 48, 'emoji16-talk');
        talkOverlay.setScale(1.5).setDepth(10000).setVisible(false);
        this.hud.ignoreWorldObjects(talkOverlay);
        this.talkOverlays.set(key, talkOverlay);
      }

      // Speech label — floating text bubble showing last dialogue line above talking chars.
      const labelBg     = this.scene.add.graphics();
      const labelHeader = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '9px', color: '#64748b',
      }).setOrigin(0.5, 0.5);
      const labelText   = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#e5e7eb',
        wordWrap: { width: 130, useAdvancedWrap: false },
        align: 'center',
      }).setOrigin(0.5, 0.5);
      const labelContainer = this.scene.add.container(c.x, c.y - 104, [labelBg, labelHeader, labelText]);
      labelContainer.setDepth(SPEECH_BUBBLE_DEPTH + 10).setVisible(false);
      this.hud.ignoreWorldObjects(labelContainer);
      this.speechLabels.set(key, { container: labelContainer, bg: labelBg, header: labelHeader, text: labelText, lastLine: '' });
    }
  }

  // ── Timer tick ───────────────────────────────────────────────────────────────

  private _tick(): void {
    if (this.paused) return;
    if (this.stepIdx >= this.replay.steps.length) {
      this.stepTimer.remove(false);
      this.activeLoop?.stop();
      this.activeLoop = null;
      const last = this.replay.steps[this.replay.steps.length - 1];
      this.hud.setReplayStatus(last.emoji ?? '🏢', last.sim_time ?? last.desc ?? '', last.step, this.replay.steps.length - 1, true);
      return;
    }
    this._applyStep(this.replay.steps[this.stepIdx++], false);
  }

  // ── Apply step ───────────────────────────────────────────────────────────────

  private _applyStep(step: SimReplayStep, instant: boolean): void {
    const ms = this.replay.meta.ms_per_step;

    this.hud.setReplayStatus(step.emoji ?? '🏢', step.sim_time ?? step.desc ?? '', step.step, this.replay.steps.length - 1, this.paused);
    if (step.sim_time) this.hud.setSimClock(step.sim_time);

    // Characters
    for (const [key, c] of Object.entries(step.chars)) {
      const sprite = this.sprites.get(key);
      if (!sprite) continue;

      // Detect commuting → active transition and kick off scripted entrance animation.
      const prevState = this.prevCharStates.get(key) ?? '';
      const justArrived = prevState === 'commuting' && c.state !== 'commuting' && c.state !== 'pre_arrival';
      this.prevCharStates.set(key, c.state ?? '');
      if (justArrived && !this.entranceInProgress.has(key)) {
        this._startEntranceSequence(key);
      }

      // While entrance animation is running, don't let step data override position.
      if (this.entranceInProgress.has(key)) {
        this._playCharAnim(sprite, SPRITE_KEY[key] ?? key, c.anim, c.facing);
        continue;
      }

      const wasVisible = sprite.visible;
      sprite.setVisible(c.visible);

      // Speech bubble — hide during conversation (text label already shows dialogue)
      const bubble = this.emojiBubbles.get(key);
      if (bubble) {
        const show = c.visible && !!(c.emoji) && c.state !== 'in_conversation';
        bubble.root.setVisible(show);
        if (show && c.emoji !== bubble.lastEmoji) {
          bubble.text.setText(c.emoji!);
          bubble.lastEmoji = c.emoji!;
        }
        if (!show) bubble.lastEmoji = '';
      }

      if (!c.visible) continue;

      // Teleport if instant OR first time becoming visible (sprite was at init position)
      if (instant || !wasVisible) {
        sprite.setPosition(c.x, c.y);
        bubble?.root.setPosition(c.x, c.y - 56);
      } else {
        this.scene.tweens.add({
          targets:  sprite,
          x: c.x, y: c.y,
          duration: ms,
          ease:     'Linear',
        });
        // Bubble follows via update() each frame — no extra tween needed
      }

      this._playCharAnim(sprite, SPRITE_KEY[key] ?? key, c.anim, c.facing);
    }

    // SFX
    if (!instant) {
      this._applySfx(step);
    }

    // Talk overlays — hidden (text label is sufficient)
    for (const [, overlay] of this.talkOverlays) {
      overlay.setVisible(false);
    }

    // Speech labels — floating dialogue text above talking characters
    const partnerOf = new Map<string, string>();
    for (const conv of step.activeConversations ?? []) {
      const [kA, kB] = conv.participants ?? [];
      if (kA && kB) { partnerOf.set(kA, kB); partnerOf.set(kB, kA); }
    }

    for (const [key, label] of this.speechLabels) {
      const c = step.chars[key];
      const inConv = !!(c?.visible && c.state === 'in_conversation');
      // c.action is `"preview text"` (quoted) when character is mid-conversation
      const raw    = inConv && c.action?.startsWith('"') ? c.action.slice(1, -1) : '';
      const line   = raw.length > 90 ? raw.slice(0, 88) + '…' : raw;
      const partner = partnerOf.get(key) ?? '';
      const headerStr = partner ? `to: ${partner.charAt(0).toUpperCase() + partner.slice(1)}` : '';
      const cacheKey  = headerStr + '|' + line;

      if (inConv && line && cacheKey !== label.lastLine) {
        label.header.setText(headerStr);
        label.text.setText(line);

        const HPAD = 18;
        const VPAD_TOP = 6;
        const VPAD_BOT = 8;
        const SEP_GAP  = 5;
        const hh = label.header.height;
        const th = label.text.height;
        const totalW = Math.max(label.header.width, label.text.width) + HPAD;
        const totalH = VPAD_TOP + hh + SEP_GAP + th + VPAD_BOT;

        // Separator Y relative to container centre
        const topEdge  = -totalH / 2;
        const headerY  = topEdge + VPAD_TOP + hh / 2;
        const sepY     = topEdge + VPAD_TOP + hh + SEP_GAP / 2;
        const textY    = topEdge + VPAD_TOP + hh + SEP_GAP + th / 2;

        label.bg.clear();
        label.bg.fillStyle(0x0f172a, 0.92);
        label.bg.fillRoundedRect(-totalW / 2, topEdge, totalW, totalH, 4);
        label.bg.lineStyle(1, 0x3b82f6, 0.65);
        label.bg.strokeRoundedRect(-totalW / 2, topEdge, totalW, totalH, 4);
        label.bg.lineStyle(1, 0x334155, 1);
        label.bg.lineBetween(-totalW / 2 + 6, sepY, totalW / 2 - 6, sepY);

        label.header.setPosition(0, headerY);
        label.text.setPosition(0, textY);
        label.lastLine = cacheKey;
      }
      label.container.setVisible(inConv && !!line);
      if (!inConv) label.lastLine = '';
    }

    // Conversation connector lines — dashed arc between each talking pair
    this.convLines.clear();
    for (const conv of step.activeConversations ?? []) {
      const [kA, kB] = conv.participants ?? [];
      if (!kA || !kB) continue;
      const sA = this.sprites.get(kA);
      const sB = this.sprites.get(kB);
      if (!sA?.visible || !sB?.visible) continue;
      this._drawDashedLine(sA.x, sA.y - 32, sB.x, sB.y - 32);
    }

    // Inspect panel refresh
    if (this.inspectKey && step.chars[this.inspectKey]) {
      const activeConv = step.activeConversations?.find(
        (conv) => conv.participants.includes(this.inspectKey!)
      ) ?? null;
      this._updateInspectPanel(this.inspectKey, step.chars[this.inspectKey], activeConv);
    }
  }

  // ── POV picker ────────────────────────────────────────────────────────────────

  private _setPov(key: string | null): void {
    this._povKey  = key;
    this._povOpen = false;
    const cam = this.scene.cameras.main;
    if (key) {
      const sprite = this.sprites.get(key);
      if (sprite) cam.startFollow(sprite, false, 0.08, 0.08);
    } else {
      cam.stopFollow();
    }
    this._renderPovPicker();
  }

  private _buildPovPicker(): void {
    const { width } = this.scene.scale;
    const x = width - POV_WIDTH - INSPECT_MARGIN;
    this._povContainer = this.scene.add.container(x, INSPECT_MARGIN)
      .setScrollFactor(0).setDepth(10002);
    this.scene.cameras.main.ignore(this._povContainer);
    this._renderPovPicker();
  }

  private _renderPovPicker(): void {
    this._povContainer.removeAll(true);
    const W = POV_WIDTH;

    const characters = this.replay.meta.characters ?? [];
    const totalH     = this._povOpen
      ? POV_H + (characters.length + 1) * POV_ITEM_H  // +1 for "Free camera"
      : POV_H;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111111, 0.92);
    bg.lineStyle(1, this._povOpen ? 0x4a90d9 : 0x333333, 1);
    bg.fillRoundedRect(0, 0, W, totalH, 4);
    bg.strokeRoundedRect(0, 0, W, totalH, 4);
    this._povContainer.add(bg);

    // Header row — label + current selection + arrow
    const selName = this._povKey
      ? (CHARACTER_ASSETS.find(a => a.owner === this._povKey)?.displayName ?? this._povKey)
      : 'Free camera';
    const headerTxt = this.scene.add.text(10, 8, `CAM  ${selName}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#9ca3af',
    });
    const arrow = this.scene.add.text(W - 16, 10, this._povOpen ? '▲' : '▼', {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#6b7280',
    });
    this._povContainer.add([headerTxt, arrow]);

    // Invisible hit-zone on header to toggle open/close
    const headerHit = this.scene.add.rectangle(0, 0, W, POV_H, 0, 0).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    headerHit.on('pointerover', () => { headerTxt.setColor('#ffffff'); });
    headerHit.on('pointerout',  () => { headerTxt.setColor('#9ca3af'); });
    headerHit.on('pointerdown', () => { this._povOpen = !this._povOpen; this._renderPovPicker(); });
    this._povContainer.add(headerHit);

    if (!this._povOpen) return;

    // Divider
    const div = this.scene.add.graphics();
    div.lineStyle(1, 0x333333, 1);
    div.lineBetween(0, POV_H, W, POV_H);
    this._povContainer.add(div);

    // Dropdown items: "Free camera" + each character
    const items: Array<{ key: string | null; label: string }> = [
      { key: null, label: 'Free camera' },
      ...characters.map(k => ({
        key: k,
        label: CHARACTER_ASSETS.find(a => a.owner === k)?.displayName ?? k,
      })),
    ];

    items.forEach((item, i) => {
      const iy      = POV_H + i * POV_ITEM_H;
      const isSelected = item.key === this._povKey;
      const color   = isSelected ? '#ffffff' : '#9ca3af';

      if (isSelected) {
        const selBg = this.scene.add.graphics();
        selBg.fillStyle(0x1e293b, 1);
        selBg.fillRect(0, iy, W, POV_ITEM_H);
        this._povContainer.add(selBg);
      }

      const bullet = this.scene.add.text(8, iy + 5, isSelected ? '●' : ' ', {
        fontFamily: 'Arial, sans-serif', fontSize: '8px', color: '#6b7280',
      });
      const label = this.scene.add.text(20, iy + 5, item.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color,
      });
      this._povContainer.add([bullet, label]);

      const rowHit = this.scene.add.rectangle(0, iy, W, POV_ITEM_H, 0, 0).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      rowHit.on('pointerover', () => { label.setColor('#ffffff'); });
      rowHit.on('pointerout',  () => { label.setColor(isSelected ? '#ffffff' : '#9ca3af'); });
      rowHit.on('pointerdown', () => { this._setPov(item.key); });
      this._povContainer.add(rowHit);
    });
  }

  // ── SFX ──────────────────────────────────────────────────────────────────────

  private _applySfx(step: SimReplayStep): void {
    if (!step.sfx?.length) return;

    for (const evt of step.sfx) {
      if (evt.stopLoop) {
        if (this.activeLoop?.isPlaying) this.activeLoop.stop();
        this.activeLoop    = null;
        this.activeLoopKey = null;
      }
      if (!evt.key) continue;
      if (!this.scene.cache.audio.exists(evt.key)) continue;

      const cfg = {
        volume: evt.volume ?? 1,
        rate:   evt.rate   ?? 1,
        detune: evt.detune ?? 0,
      };

      if (evt.loop) {
        if (this.activeLoopKey !== evt.key) {
          if (this.activeLoop?.isPlaying) this.activeLoop.stop();
          this.activeLoop    = this.scene.sound.add(evt.key);
          this.activeLoop.play({ ...cfg, loop: true });
          this.activeLoopKey = evt.key;
        }
      } else {
        this.scene.sound.play(evt.key, cfg);
      }
    }
  }

  // ── Scripted building-entry sequence ─────────────────────────────────────────
  // Mirrors sandbox withEntranceIfNeeded(): walk to entrance → walk through →
  // teleport to elevator → walk up elevator → release to step-driven movement.

  private _startEntranceSequence(key: string): void {
    const sprite = this.sprites.get(key);
    if (!sprite) return;

    this.entranceInProgress.add(key);
    const spriteKey = SPRITE_KEY[key] ?? key;

    const walkDuration = (ax: number, ay: number, bx: number, by: number) =>
      Math.hypot(bx - ax, by - ay) / ENTRANCE_WALK_SPEED_PX_S * 1000;

    // Start at ground entrance, walking toward the door
    sprite.setPosition(ENTRANCE_START.x, ENTRANCE_START.y);
    sprite.setVisible(true);
    const animKey = `${spriteKey}-walk-back`;
    if (this.scene.anims.exists(animKey)) sprite.play(animKey, true);

    // Play door sound if available
    if (this.scene.cache.audio.exists('entrance_door')) {
      this.scene.time.delayedCall(
        walkDuration(ENTRANCE_START.x, ENTRANCE_START.y, ENTRANCE_END.x, ENTRANCE_END.y),
        () => { this.scene.sound.play('entrance_door', { volume: 0.4 }); }
      );
    }

    this.scene.tweens.add({
      targets:  sprite,
      x: ENTRANCE_END.x, y: ENTRANCE_END.y,
      duration: walkDuration(ENTRANCE_START.x, ENTRANCE_START.y, ENTRANCE_END.x, ENTRANCE_END.y),
      ease:     'Linear',
      onComplete: () => {
        // Teleport to elevator base, play walk-back up the elevator shaft
        sprite.setPosition(ELEVATOR_START.x, ELEVATOR_START.y);
        const elevAnimKey = `${spriteKey}-walk-back`;
        if (this.scene.anims.exists(elevAnimKey)) sprite.play(elevAnimKey, true);

        this.scene.tweens.add({
          targets:  sprite,
          x: ELEVATOR_END.x, y: ELEVATOR_END.y,
          duration: walkDuration(ELEVATOR_START.x, ELEVATOR_START.y, ELEVATOR_END.x, ELEVATOR_END.y),
          ease:     'Linear',
          onComplete: () => {
            this.entranceInProgress.delete(key);
          },
        });
      },
    });
  }

  // ── Character animation ───────────────────────────────────────────────────────

  private _playCharAnim(
    sprite:    Phaser.GameObjects.Sprite,
    spriteKey: string,
    anim:      AnimBase,
    facing:    Facing,
  ): void {
    const base =
      anim === 'walk' ? 'walk' :
      anim === 'sit'  ? (facing === 'left' || facing === 'right' ? 'sit-legs' : 'idle-full') :
      'idle-full';

    const key = `${spriteKey}-${base}-${facing}`;
    if (sprite.anims.currentAnim?.key !== key && this.scene.anims.exists(key)) {
      sprite.play(key, true);
    }
  }

  // ── Inspect panel ─────────────────────────────────────────────────────────────

  private _buildInspectPanel(): void {
    const { height } = this.scene.scale;
    const panelH = Math.min(INSPECT_PANEL_H, height - 60);
    const x      = INSPECT_MARGIN;
    const y      = height - panelH - INSPECT_MARGIN;

    this.inspectPanel = this.scene.add.container(x, y).setScrollFactor(0).setDepth(10000).setVisible(false);
    // Do NOT call cameras.main.ignore(container) — it only snapshots current children.
    // _addToPanel() ignores each child explicitly so dynamically-added items aren't double-drawn.

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0b0d12, 0.94);
    bg.fillRoundedRect(0, 0, INSPECT_WIDTH, panelH, 8);
    bg.lineStyle(1, 0x2a2f3a, 1);
    bg.strokeRoundedRect(0, 0, INSPECT_WIDTH, panelH, 8);
    this._addToPanel(bg);

    const closeBtn = this.scene.add.text(INSPECT_WIDTH - 18, 12, '✕', {
      fontFamily: 'monospace', fontSize: '12px', color: '#6b7280',
    }).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#6b7280'));
    closeBtn.on('pointerdown', () => { this.inspectKey = null; this.inspectPanel.setVisible(false); });
    this._addToPanel(closeBtn);
  }

  private _addToPanel(go: Phaser.GameObjects.GameObject): void {
    this.scene.cameras.main.ignore(go);
    this.inspectPanel.add(go);
  }

  private _selectChar(key: string): void {
    const step = this.replay.steps[Math.max(0, this.stepIdx - 1)];
    const c = step?.chars[key];
    if (!c) return;
    this.inspectKey = key;
    this.inspectPanel.setVisible(true);
    const activeConv = step?.activeConversations?.find(conv => conv.participants.includes(key)) ?? null;
    this._updateInspectPanel(key, c, activeConv);
  }

  private _updateInspectPanel(key: string, c: CharReplayState, activeConv: ActiveConvSnapshot | null = null): void {
    const toRemove = this.inspectPanel.list.slice(2);
    for (const go of toRemove) (go as Phaser.GameObjects.GameObject).destroy();

    const W       = INSPECT_WIDTH;
    const pad     = 14;
    const COL_GAP = 14;
    const LEFT_W  = 185;          // left column content width
    const RIGHT_X = pad + LEFT_W + COL_GAP;   // right column x origin
    const RIGHT_W = W - RIGHT_X - pad;        // right column content width

    let leftY  = 14;
    let rightY = 14;

    const txt = (x: number, y: number, s: string, style: object = {}) =>
      this._addToPanel(this.scene.add.text(x, y, s, { fontFamily: 'monospace', fontSize: '10px', color: '#d4d4d8', ...style }));

    const sectionHeader = (y: number, x1: number, x2: number, label: string, accent = '#71717a'): number => {
      txt(x1, y, label, { fontSize: '9px', color: accent, fontStyle: 'bold' });
      const line = this.scene.add.graphics();
      line.lineStyle(1, 0x23272f, 1);
      line.lineBetween(x1, y + 13, x2, y + 13);
      this._addToPanel(line);
      return y + 18;
    };

    // ── Header: accent stripe + name (full width) ──
    const accentColor = this._accentForKey(key);
    const stripe = this.scene.add.graphics();
    stripe.fillStyle(accentColor, 1);
    stripe.fillRoundedRect(pad, leftY + 2, 3, 14, 1.5);
    this._addToPanel(stripe);

    const displayName = CHARACTER_ASSETS.find(a => a.owner === key)?.displayName ?? key;
    txt(pad + 10, leftY, displayName.toUpperCase(), { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' });
    leftY += 22;

    if (c.currently) {
      txt(pad, leftY, c.currently, { color: '#9ca3af', fontSize: '10px', fontStyle: 'italic', wordWrap: { width: W - pad * 2 } });
      const lines = Math.max(1, Math.ceil(c.currently.length / 58));
      leftY += lines * 13 + 4;
    }
    leftY += 8;
    rightY = leftY;   // both columns start at the same Y after the header

    // ── Left column: Emotional state (PAD) ──
    if (c.pad) {
      leftY = sectionHeader(leftY, pad, pad + LEFT_W, 'EMOTIONAL STATE');

      const labelW = 48;
      const valW   = 26;
      const barW   = LEFT_W - labelW - valW;
      const padRows: [string, number, number][] = [
        ['Pleasure',  c.pad.pleasure  ?? 0, 0x4ade80],
        ['Arousal',   c.pad.arousal   ?? 0, 0xfacc15],
        ['Dominance', c.pad.dominance ?? 0, 0x60a5fa],
      ];
      for (const [label, val, color] of padRows) {
        txt(pad, leftY, label, { fontSize: '9px', color: '#a1a1aa' });
        this._drawBar(pad + labelW, leftY + 2, barW, 7, (val + 1) / 2, color, true);
        const valStr = (val >= 0 ? '+' : '') + val.toFixed(2);
        txt(pad + labelW + barW + 2, leftY, valStr, { fontSize: '9px', color: '#71717a' });
        leftY += 13;
      }
      leftY += 6;
    }

    // ── Left column: Needs ──
    if (c.needs && Object.keys(c.needs).length) {
      leftY = sectionHeader(leftY, pad, pad + LEFT_W, 'NEEDS');

      const needOrder = ['hunger','thirst','energy','bladder','stress','social','belonging','esteem','stimulation','productivity'];
      const labelW = 60;
      const valW   = 22;
      const barW   = LEFT_W - labelW - valW;
      for (const need of needOrder) {
        const val = c.needs[need];
        if (val === undefined) continue;
        const severity = need === 'stress' ? val : 1 - val;
        const isUrgent = severity > 0.65;
        const isWarn   = severity > 0.4;
        const barColor   = isUrgent ? 0xef4444 : isWarn ? 0xf59e0b : 0x22d3ee;
        const labelColor = isUrgent ? '#f87171' : isWarn ? '#fbbf24' : '#a1a1aa';
        const nameLabel  = need.charAt(0).toUpperCase() + need.slice(1);
        txt(pad, leftY, nameLabel, { fontSize: '9px', color: labelColor });
        this._drawBar(pad + labelW, leftY + 2, barW, 7, val, barColor, false);
        txt(pad + labelW + barW + 2, leftY, val.toFixed(2), { fontSize: '9px', color: '#71717a' });
        leftY += 12;
      }
      leftY += 8;
    }

    // ── Right column: Last thought ──
    if (c.thinking) {
      rightY = sectionHeader(rightY, RIGHT_X, W - pad, 'LAST THOUGHT');
      txt(RIGHT_X, rightY, c.thinking, { color: '#cbd5e1', fontSize: '10px', fontStyle: 'italic', wordWrap: { width: RIGHT_W } });
      const lines = Math.max(1, Math.ceil(c.thinking.length / Math.floor(RIGHT_W / 6)));
      rightY += lines * 13 + 10;
    }

    // ── Conversation transcript: full width, below both columns ──
    let curY = Math.max(leftY, rightY) + 4;

    if (activeConv && activeConv.turns.length > 0) {
      const divider = this.scene.add.graphics();
      divider.lineStyle(1, 0x23272f, 1);
      divider.lineBetween(pad, curY, W - pad, curY);
      this._addToPanel(divider);
      curY += 10;

      curY = sectionHeader(curY, pad, W - pad, 'IN CONVERSATION', '#60a5fa');

      const otherKey  = activeConv.participants?.find(p => p !== key) ?? '';
      const otherName = CHARACTER_ASSETS.find(a => a.owner === otherKey)?.displayName ?? otherKey;
      txt(pad, curY, `with ${otherName}`, { color: '#94a3b8', fontSize: '9px' });
      curY += 16;

      const fullInnerW = W - pad * 2;
      const turns = activeConv.turns.slice(-6);
      for (const turn of turns) {
        const isMe        = turn.speaker === key;
        const speakerName = CHARACTER_ASSETS.find(a => a.owner === turn.speaker)?.displayName ?? turn.speaker;
        txt(pad, curY, speakerName, { fontSize: '9px', color: isMe ? '#60a5fa' : '#c084fc', fontStyle: 'bold' });
        curY += 12;
        const line = `"${turn.line}"`;
        txt(pad + 6, curY, line, { color: '#e5e7eb', wordWrap: { width: fullInnerW - 6 }, fontSize: '9px' });
        const lines = Math.max(1, Math.ceil(line.length / 54));
        curY += lines * 12 + 4;
      }
    }
  }

  private _drawDashedLine(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len;
    const dashLen = 6, gap = 5;
    this.convLines.lineStyle(1.5, 0x60a5fa, 0.5);
    let t = 0;
    while (t < len) {
      const t2 = Math.min(t + dashLen, len);
      this.convLines.beginPath();
      this.convLines.moveTo(x1 + ux * t, y1 + uy * t);
      this.convLines.lineTo(x1 + ux * t2, y1 + uy * t2);
      this.convLines.strokePath();
      t += dashLen + gap;
    }
  }

  private _accentForKey(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const palette = [0x60a5fa, 0xf472b6, 0x4ade80, 0xfacc15, 0xa78bfa, 0xfb923c, 0x22d3ee, 0xf87171, 0xc084fc, 0x34d399];
    return palette[h % palette.length];
  }

  private _drawBar(x: number, y: number, w: number, h: number, pct: number, color: number, midZero: boolean): void {
    const r = Math.min(2, h / 2);
    const g = this.scene.add.graphics();
    g.fillStyle(0x1f2330, 1);
    g.fillRoundedRect(x, y, w, h, r);
    g.fillStyle(color, 1);
    if (midZero) {
      const mid = x + w / 2;
      // center tick
      g.fillStyle(0x3a3f4d, 1);
      g.fillRect(mid - 0.5, y - 1, 1, h + 2);
      g.fillStyle(color, 1);
      const clamped = Math.max(0, Math.min(1, pct));
      if (clamped >= 0.5) {
        g.fillRoundedRect(mid, y, (clamped - 0.5) * w, h, { tl: 0, bl: 0, tr: r, br: r });
      } else {
        const fw = (0.5 - clamped) * w;
        g.fillRoundedRect(x + clamped * w, y, fw, h, { tl: r, bl: r, tr: 0, br: 0 });
      }
    } else {
      const fw = Math.max(0, Math.min(1, pct)) * w;
      if (fw > 0) g.fillRoundedRect(x, y, fw, h, r);
    }
    this._addToPanel(g);
  }
}
