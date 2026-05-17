import Phaser from 'phaser';
import { CHARACTER_ASSETS } from '../config/characters';
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

const CHAR_DEPTH     = 17;
const CAR_DEPTH      = 15;
const INSPECT_WIDTH  = 240;
const INSPECT_MARGIN = 12;

export class MainMapReplayController {
  private readonly replay: ReplayFile;
  private stepIdx = 0;
  private paused  = false;
  private stepTimer!: Phaser.Time.TimerEvent;

  private sprites    = new Map<string, Phaser.GameObjects.Sprite>();
  private carSprites = new Map<string, Phaser.GameObjects.Sprite>();

  // Active looping SFX
  private activeLoop:    Phaser.Sound.BaseSound | null = null;
  private activeLoopKey: string | null = null;

  // Camera follow target
  private followTarget: Phaser.GameObjects.Sprite | null = null;
  private followId:     string | null = null;

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

    // Camera — start at parking lot entrance; follow logic takes over per-step
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
    this.activeLoop?.stop();
    this.activeLoop = null;
    this.inspectPanel?.destroy();
  }

  // ── Spawn characters ─────────────────────────────────────────────────────────

  private _spawnSprites(step: SimReplayStep): void {
    for (const key of Object.keys(step.chars)) {
      if (this.sprites.has(key)) continue;
      const spriteKey = SPRITE_KEY[key];
      if (!spriteKey) continue;

      const c = step.chars[key];
      const sprite = this.scene.add.sprite(c.x, c.y, spriteKey);
      sprite.setDepth(CHAR_DEPTH);
      sprite.setOrigin(0.5, 1);
      sprite.setVisible(c.visible);
      sprite.setInteractive();
      sprite.on('pointerdown', () => this._selectChar(key));
      this.sprites.set(key, sprite);
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

    // Cars
    this._applyCarStep(step, instant, ms);

    // Characters
    for (const [key, c] of Object.entries(step.chars)) {
      const sprite = this.sprites.get(key);
      if (!sprite) continue;

      sprite.setVisible(c.visible);
      if (!c.visible) continue;

      if (instant) {
        sprite.setPosition(c.x, c.y);
      } else {
        this.scene.tweens.add({
          targets:  sprite,
          x: c.x, y: c.y,
          duration: ms,
          ease:     'Linear',
        });
      }

      this._playCharAnim(sprite, SPRITE_KEY[key] ?? key, c.anim, c.facing);
    }

    // Camera follow
    if (step.follow !== undefined) {
      this._updateFollow(step.follow);
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
      const sprite = this.carSprites.get(key);
      if (!sprite) continue;

      sprite.setVisible(c.visible);
      if (!c.visible) continue;

      if (instant) {
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

  // ── Camera follow ─────────────────────────────────────────────────────────────

  private _updateFollow(followId: string): void {
    if (followId === this.followId) return;
    this.followId = followId;

    let target: Phaser.GameObjects.Sprite | null = null;
    if (followId.endsWith('_car')) {
      target = this.carSprites.get(followId.slice(0, -4)) ?? null;
    } else {
      target = this.sprites.get(followId) ?? null;
    }

    if (target) {
      this.followTarget = target;
      this.scene.cameras.main.startFollow(target, false, 0.08, 0.08);
    }
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
    const x = width - INSPECT_WIDTH - INSPECT_MARGIN;
    const y = INSPECT_MARGIN;

    this.inspectPanel = this.scene.add.container(x, y).setScrollFactor(0).setDepth(10000).setVisible(false);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111111, 0.88);
    bg.lineStyle(1, 0x333333, 1);
    bg.fillRoundedRect(0, 0, INSPECT_WIDTH, height - INSPECT_MARGIN * 2, 6);
    bg.strokeRoundedRect(0, 0, INSPECT_WIDTH, height - INSPECT_MARGIN * 2, 6);
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
