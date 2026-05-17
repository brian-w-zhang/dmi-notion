import Phaser from 'phaser';
import { CHARACTER_ASSETS } from '../config/characters';
import { registerAnimations } from '../systems/AnimationRegistry';
import { registerCarAnimations } from '../systems/CarAnimationRegistry';
import { CAR_SHEET_6x6, CAR_SHEET_5x5 } from '../data/carAnimations';
import type { MainMapHud } from './mainMapHud';

// ── Types ─────────────────────────────────────────────────────────────────────

type Facing   = 'front' | 'back' | 'left' | 'right';
type AnimBase = 'walk' | 'idle' | 'sit';
type CarAnim  = 'drive' | 'idle';

interface CarReplayState {
  x:       number;
  y:       number;
  facing:  Facing;
  anim:    CarAnim;
  visible: boolean;
}

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

interface SimReplayStep {
  step:           number;
  sim_time?:      string;
  emoji?:         string;
  desc?:          string;
  follow?:        string;
  chars:          Record<string, CharReplayState>;
  cars?:          Record<string, CarReplayState>;
  sfx?:           SfxEvent[];
  conversations?: object[];
  announcements?: { from: string; message: string }[];
  events?:        object[];
}

interface ReplayMeta {
  ms_per_step:     number;
  sec_per_step?:   number;
  sim_code?:       string;
  start_sim_time?: string;
  characters:      string[];
  car_textures?:   Record<string, string>;
}

interface ReplayFile {
  meta:  ReplayMeta;
  steps: SimReplayStep[];
}

// ── Sprite key lookup ─────────────────────────────────────────────────────────

const SPRITE_KEY: Record<string, string> = Object.fromEntries(
  CHARACTER_ASSETS.map(a => [a.owner, a.spriteKey])
);

// ── Controller ────────────────────────────────────────────────────────────────

const CHAR_DEPTH      = 17;
const CAR_DEPTH       = 15;
const INSPECT_WIDTH   = 200;
const INSPECT_MARGIN  = 12;
const POV_H           = 30;   // collapsed POV picker height
const POV_ITEM_H      = 22;   // each dropdown row height
const POV_GAP         = 4;    // gap between POV picker and inspect panel

export class MainMapReplayController {
  private readonly replay: ReplayFile;
  private stepIdx = 0;
  private paused  = false;
  private stepTimer!: Phaser.Time.TimerEvent;

  private sprites      = new Map<string, Phaser.GameObjects.Sprite>();
  private carSprites   = new Map<string, Phaser.GameObjects.Sprite>();
  // Speech bubbles: same white-bubble + emoji-text as sandbox ApplianceActionController.
  // Per-frame sync via update() keeps the bubble glued to the sprite during tweens.
  private emojiBubbles = new Map<string, { root: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; lastEmoji: string }>();

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
  ) {
    this.replay = scene.cache.json.get('replay') as ReplayFile;
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

    this._spawnCars(steps[0]);
    this._spawnSprites(steps[0]);
    this._buildPovPicker();
    this._buildInspectPanel();
    this._applyStep(steps[0], true);
    this.stepIdx = 1;

    this.hud.enterReplayMode(steps.length - 1, meta.ms_per_step, {
      onPlayPause: () => this.togglePause(),
      onSeek:      idx => this.seekTo(idx),
      onSkip:      n   => this.skipSteps(n),
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
  }

  destroy(): void {
    this.stepTimer?.remove(false);
    this.sprites.forEach(s => s.destroy());
    this.sprites.clear();
    this.carSprites.forEach(s => s.destroy());
    this.carSprites.clear();
    this.emojiBubbles.forEach(b => b.root.destroy(true));
    this.emojiBubbles.clear();
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
    }
  }

  // ── Spawn cars ───────────────────────────────────────────────────────────────

  private _spawnCars(step: SimReplayStep): void {
    if (!step.cars) return;
    const carTextures = this.replay.meta.car_textures ?? {};

    for (const key of Object.keys(step.cars)) {
      if (this.carSprites.has(key)) continue;
      const textureKey = carTextures[key];
      if (!textureKey) continue;

      const sheetInfo = textureKey.startsWith('car-3') ? CAR_SHEET_6x6 : CAR_SHEET_5x5;
      registerCarAnimations(this.scene, textureKey, sheetInfo);

      const c = step.cars[key];
      const sprite = this.scene.add.sprite(c.x, c.y, textureKey);
      sprite.setDepth(CAR_DEPTH);
      sprite.setOrigin(0.5, 0.5);
      sprite.setVisible(c.visible);
      this.hud.ignoreWorldObjects(sprite);   // prevent uiCamera double-draw
      this.carSprites.set(key, sprite);
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

    // Cars
    this._applyCarStep(step, instant, ms);

    // Characters
    for (const [key, c] of Object.entries(step.chars)) {
      const sprite = this.sprites.get(key);
      if (!sprite) continue;

      const wasVisible = sprite.visible;
      sprite.setVisible(c.visible);

      // Speech bubble — show when character is visible and has a non-empty emoji
      const bubble = this.emojiBubbles.get(key);
      if (bubble) {
        const show = c.visible && !!(c.emoji);
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

    // Inspect panel refresh
    if (this.inspectKey && step.chars[this.inspectKey]) {
      this._updateInspectPanel(this.inspectKey, step.chars[this.inspectKey]);
    }
  }

  // ── Apply car step ───────────────────────────────────────────────────────────

  private _applyCarStep(step: SimReplayStep, instant: boolean, ms: number): void {
    if (!step.cars) return;
    const carTextures = this.replay.meta.car_textures ?? {};

    for (const [key, c] of Object.entries(step.cars)) {
      let sprite = this.carSprites.get(key);
      if (!sprite) {
        // Lazy-spawn: car didn't exist at step 0 (arrived later)
        const textureKey = carTextures[key];
        if (!textureKey) continue;
        const sheetInfo = textureKey.startsWith('car-3') ? CAR_SHEET_6x6 : CAR_SHEET_5x5;
        registerCarAnimations(this.scene, textureKey, sheetInfo);
        sprite = this.scene.add.sprite(c.x, c.y, textureKey);
        sprite.setDepth(CAR_DEPTH);
        sprite.setOrigin(0.5, 0.5);
        sprite.setVisible(false);
        this.hud.ignoreWorldObjects(sprite);
        this.carSprites.set(key, sprite);
      }

      const wasVisible = sprite.visible;
      sprite.setVisible(c.visible);
      if (!c.visible) continue;

      // Teleport if instant OR first time becoming visible (sprite was at init position)
      if (instant || !wasVisible) {
        sprite.setPosition(c.x, c.y);
      } else {
        this.scene.tweens.add({
          targets:  sprite,
          x: c.x, y: c.y,
          duration: ms,
          ease:     'Linear',
        });
      }

      const textureKey = carTextures[key] ?? key;
      const animKey    = `${textureKey}-${c.anim}-${c.facing}`;
      if (this.scene.anims.exists(animKey) && sprite.anims.currentAnim?.key !== animKey) {
        sprite.play(animKey, true);
      }
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
    const x = width - INSPECT_WIDTH - INSPECT_MARGIN;
    this._povContainer = this.scene.add.container(x, INSPECT_MARGIN)
      .setScrollFactor(0).setDepth(10002);
    this.scene.cameras.main.ignore(this._povContainer);
    this._renderPovPicker();
  }

  private _renderPovPicker(): void {
    this._povContainer.removeAll(true);
    const W = INSPECT_WIDTH;

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
      fontFamily: 'monospace', fontSize: '9px', color: '#cccccc',
    });
    const arrow = this.scene.add.text(W - 16, 10, this._povOpen ? '▲' : '▼', {
      fontFamily: 'monospace', fontSize: '8px', color: '#4a90d9',
    });
    this._povContainer.add([headerTxt, arrow]);

    // Invisible hit-zone on header to toggle open/close
    const headerHit = this.scene.add.rectangle(0, 0, W, POV_H, 0, 0).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    headerHit.on('pointerover', () => { headerTxt.setColor('#ffffff'); });
    headerHit.on('pointerout',  () => { headerTxt.setColor('#cccccc'); });
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
      const color   = isSelected ? '#ffffff' : '#888888';

      if (isSelected) {
        const selBg = this.scene.add.graphics();
        selBg.fillStyle(0x1a3a5c, 1);
        selBg.fillRect(0, iy, W, POV_ITEM_H);
        this._povContainer.add(selBg);
      }

      const bullet = this.scene.add.text(8, iy + 5, isSelected ? '●' : ' ', {
        fontFamily: 'monospace', fontSize: '8px', color: '#4a90d9',
      });
      const label = this.scene.add.text(20, iy + 5, item.label, {
        fontFamily: 'monospace', fontSize: '9px', color,
      });
      this._povContainer.add([bullet, label]);

      const rowHit = this.scene.add.rectangle(0, iy, W, POV_ITEM_H, 0, 0).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      rowHit.on('pointerover', () => { label.setColor('#ffffff'); });
      rowHit.on('pointerout',  () => { label.setColor(isSelected ? '#ffffff' : '#888888'); });
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
    const { width, height } = this.scene.scale;
    const x      = width - INSPECT_WIDTH - INSPECT_MARGIN;
    const y      = INSPECT_MARGIN + POV_H + POV_GAP;
    const panelH = height - y - INSPECT_MARGIN;

    this.inspectPanel = this.scene.add.container(x, y).setScrollFactor(0).setDepth(10000).setVisible(false);
    this.scene.cameras.main.ignore(this.inspectPanel);  // render on uiCamera only

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111111, 0.88);
    bg.lineStyle(1, 0x333333, 1);
    bg.fillRoundedRect(0, 0, INSPECT_WIDTH, panelH, 6);
    bg.strokeRoundedRect(0, 0, INSPECT_WIDTH, panelH, 6);
    this.inspectPanel.add(bg);

    const closeBtn = this.scene.add.text(INSPECT_WIDTH - 16, 10, '✕', {
      fontFamily: 'monospace', fontSize: '11px', color: '#555555',
    }).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this.inspectKey = null; this.inspectPanel.setVisible(false); });
    this.inspectPanel.add(closeBtn);
  }

  private _selectChar(key: string): void {
    const step = this.replay.steps[Math.max(0, this.stepIdx - 1)];
    const c = step?.chars[key];
    if (!c) return;
    this.inspectKey = key;
    this.inspectPanel.setVisible(true);
    this._updateInspectPanel(key, c);
  }

  private _updateInspectPanel(key: string, c: CharReplayState): void {
    while (this.inspectPanel.length > 2) {
      this.inspectPanel.getAt<Phaser.GameObjects.GameObject>(2).destroy();
      this.inspectPanel.removeAt(2);
    }

    const W   = INSPECT_WIDTH;
    const pad = 12;
    let curY  = 14;

    const add = (go: Phaser.GameObjects.GameObject) => { this.inspectPanel.add(go); };
    const txt = (x: number, y: number, s: string, style: object) =>
      add(this.scene.add.text(x, y, s, { fontFamily: 'monospace', fontSize: '9px', color: '#cccccc', wordWrap: { width: W - pad * 2 }, ...style }));

    const displayName = CHARACTER_ASSETS.find(a => a.owner === key)?.displayName ?? key;
    txt(pad, curY, displayName.toUpperCase(), { fontSize: '10px', color: '#ffffff' });
    curY += 16;

    if (c.currently) {
      txt(pad, curY, c.currently, { color: '#888888', wordWrap: { width: W - pad * 2 } });
      curY += 28;
    } else {
      curY += 4;
    }

    // PAD
    if (c.pad) {
      txt(pad, curY, 'EMOTIONAL STATE', { fontSize: '8px', color: '#555555' });
      curY += 12;

      const padLabels: [string, number, number][] = [
        ['P', c.pad.pleasure,  0x4ade80],
        ['A', c.pad.arousal,   0xfacc15],
        ['D', c.pad.dominance, 0x60a5fa],
      ];
      for (const [label, val, color] of padLabels) {
        txt(pad, curY, label, { color: '#777777' });
        this._drawBar(pad + 12, curY + 2, W - pad * 2 - 12, 7, (val + 1) / 2, color, true);
        txt(W - pad - 30, curY, val.toFixed(2), { color: '#666666' });
        curY += 12;
      }
      curY += 4;
    }

    // Needs
    if (c.needs && Object.keys(c.needs).length) {
      txt(pad, curY, 'NEEDS', { fontSize: '8px', color: '#555555' });
      curY += 12;

      const needOrder = ['hunger','thirst','energy','bladder','stress','social','belonging','esteem','stimulation','productivity'];
      for (const need of needOrder) {
        const val = c.needs[need];
        if (val === undefined) continue;
        const isUrgent = val < 0.35;
        const barColor = isUrgent ? 0xef4444 : need === 'stress' ? 0xf97316 : 0x22d3ee;

        txt(pad, curY, need, { color: isUrgent ? '#ef4444' : '#666666' });
        this._drawBar(pad + 68, curY + 2, W - pad * 2 - 68 - 26, 7, val, barColor, false);
        txt(W - pad - 22, curY, val.toFixed(2), { color: '#555555', fontSize: '8px' });
        curY += 11;
      }
      curY += 6;
    }

    // Thinking
    if (c.thinking) {
      txt(pad, curY, 'LAST THOUGHT', { fontSize: '8px', color: '#555555' });
      curY += 12;
      txt(pad, curY, c.thinking, { color: '#9ca3af', wordWrap: { width: W - pad * 2 } });
    }
  }

  private _drawBar(x: number, y: number, w: number, h: number, pct: number, color: number, midZero: boolean): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x222222, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(color, 1);
    if (midZero) {
      const mid = x + w / 2;
      if (pct >= 0.5) {
        g.fillRect(mid, y, (pct - 0.5) * w, h);
      } else {
        g.fillRect(x + pct * w, y, (0.5 - pct) * w, h);
      }
    } else {
      g.fillRect(x, y, Math.max(0, pct) * w, h);
    }
    this.inspectPanel.add(g);
  }
}
