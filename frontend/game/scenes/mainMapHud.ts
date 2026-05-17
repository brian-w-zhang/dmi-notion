import Phaser from 'phaser';
import { HUD_BOTTOM_HINT_OFFSET, HUD_DEPTH } from './mainMap.constants';

type EntranceMode = 'enter' | 'exit';
type CameraMode = 'manual' | 'follow';

const TOGGLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '13px',
  fontFamily: 'monospace',
  color: '#ffffff',
  backgroundColor: '#00000088',
  padding: { x: 6, y: 4 },
};

const CONTEXT_HINT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '14px',
  fontFamily: 'monospace',
  color: '#ffffff',
  backgroundColor: '#00000099',
  padding: { left: 10, right: 10, top: 5, bottom: 9 },
};

export class MainMapHud {
  private readonly scene: Phaser.Scene;
  private readonly sceneW: number;
  private readonly sceneH: number;
  private readonly bottomHintY: number;
  private readonly onToggleCameraMode: () => void;
  private readonly onToggleSimulation: () => void;
  private readonly onHome: () => void;
  private readonly hudRoot: Phaser.GameObjects.Container;
  private readonly positionText: Phaser.GameObjects.Text;
  private readonly cameraModeToggle: Phaser.GameObjects.Text;
  private readonly simulationToggle: Phaser.GameObjects.Text;
  private readonly sitHint: Phaser.GameObjects.Text;
  private readonly actionHint: Phaser.GameObjects.Text;
  private readonly entranceHint: Phaser.GameObjects.Text;
  private readonly mountHint: Phaser.GameObjects.Text;
  private readonly carControlsHint: Phaser.GameObjects.Text;
  // Replay-mode UI (hidden in sandbox, shown during replay playback)
  private replayPickerContainer:        Phaser.GameObjects.Container | null = null;
  private _onReplayChange: ((index: number) => void) | null = null;
  private _currentReplayIndex = 0;
  private readonly replayBar:           Phaser.GameObjects.Container;
  private readonly replayStatusLine:    Phaser.GameObjects.Text;
  private readonly replayPlayPauseBtn:  Phaser.GameObjects.Text;
  private          replaySpeedBtn!:     Phaser.GameObjects.Text;
  private readonly replayTrackFill:     Phaser.GameObjects.Graphics;
  private readonly replayPlayhead:      Phaser.GameObjects.Graphics;
  private readonly replayTimeLabel:     Phaser.GameObjects.Text;
  private readonly simClock:            Phaser.GameObjects.Text;
  // Playback state
  private _onPlayPause:    (() => void) | null = null;
  private _onSeek:         ((idx: number) => void) | null = null;
  private _onSkip:         ((steps: number) => void) | null = null;
  private _onSpeedChange:  ((mult: number) => void) | null = null;
  private _speedSteps      = [1, 2, 0.5];
  private _speedIdx        = 0;
  private _replaySkipSteps = 188;
  private _replayTotalSteps = 1;
  private _replayMsPerStep  = 53;
  private _trackX = 0;
  private _trackW = 0;
  private _trackCtrlY = 0;
  private _draggingTrack = false;

  private readonly uiCamera: Phaser.Cameras.Scene2D.Camera;
  private hudChromeVisible = true;

  constructor(
    scene: Phaser.Scene,
    sceneW: number,
    sceneH: number,
    worldObjects: Phaser.GameObjects.GameObject[],
    initialCameraMode: CameraMode,
    onToggleCameraMode: () => void,
    onToggleSimulation: () => void,
    onHome: () => void,
  ) {
    this.scene = scene;
    this.onToggleCameraMode = onToggleCameraMode;
    this.onToggleSimulation = onToggleSimulation;
    this.onHome = onHome;
    this.sceneW = sceneW;
    this.sceneH = sceneH;
    this.bottomHintY = sceneH - HUD_BOTTOM_HINT_OFFSET;

    const homeBtn = scene.add.text(8, 8, '⌂  menu', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#94a3b8',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    }).setInteractive({ useHandCursor: true });
    homeBtn.on('pointerover', () => homeBtn.setColor('#ffffff'));
    homeBtn.on('pointerout', () => homeBtn.setColor('#94a3b8'));
    homeBtn.on('pointerdown', () => this.onHome());

    this.positionText = scene.add.text(8, 36, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    });

    this.cameraModeToggle = scene.add.text(8, 64, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    });

    this.setCameraMode(initialCameraMode);

    this.simulationToggle = scene.add.text(sceneW - 8, 8, 'simulation: off', TOGGLE_STYLE)
      .setOrigin(1, 0);
    this.wireSimulationTogglePointer();

    this.sitHint = scene.add.text(this.sceneW / 2, this.bottomHintY, '[c] sit', CONTEXT_HINT_STYLE)
      .setOrigin(0.5, 1).setVisible(false);

    this.entranceHint = scene.add.text(sceneW / 2, sceneH - HUD_BOTTOM_HINT_OFFSET, '[e] enter building', CONTEXT_HINT_STYLE)
      .setOrigin(0.5, 1).setVisible(false);

    this.actionHint = scene.add.text(this.sceneW / 2, this.bottomHintY, '[1] to interact', CONTEXT_HINT_STYLE)
      .setOrigin(0.5, 1).setVisible(false);

    this.mountHint = scene.add.text(sceneW / 2, sceneH - HUD_BOTTOM_HINT_OFFSET, '[x] enter car', CONTEXT_HINT_STYLE)
      .setOrigin(0.5, 1).setVisible(false);

    this.carControlsHint = scene.add.text(
      sceneW / 2,
      sceneH - HUD_BOTTOM_HINT_OFFSET,
      '[x] exit car\n[shift] reverse',
      {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#ffffff',
        backgroundColor: '#00000099',
        align: 'center',
        padding: { left: 12, right: 12, top: 6, bottom: 8 },
      }
    ).setOrigin(0.5, 1).setVisible(true).setLineSpacing(3);

    // ── Playback bar layout ──────────────────────────────────────────────────────
    const BAR_W   = Math.min(600, sceneW - 32);
    const BAR_H   = 42;
    const BAR_X   = (sceneW - BAR_W) / 2;
    const BAR_Y   = sceneH - BAR_H - 10;
    const PAD_W   = 16;
    const BTN_GAP = 8;
    const TIME_W  = 84;

    const ctrlY     = BAR_Y + BAR_H / 2;

    // Left controls: [speed] [play/pause]
    const speedBtnX = BAR_X + PAD_W + 16;           // ~32px wide pill
    const btnPlayX  = speedBtnX + 20 + BTN_GAP + 14;
    const trackX    = btnPlayX + 20 + 12;
    const trackEndX = BAR_X + BAR_W - PAD_W - TIME_W - 8;
    const trackW    = trackEndX - trackX;
    const TRACK_H   = 3;
    const timeX     = BAR_X + BAR_W - PAD_W;

    this._trackX    = trackX;
    this._trackW    = trackW;
    this._trackCtrlY = ctrlY;

    // Static bar background (drawn once into a graphics object)
    const barBg = scene.add.graphics();
    barBg.fillStyle(0x060d18, 0.93);
    barBg.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 10);
    barBg.lineStyle(1, 0x1e293b, 1);
    barBg.strokeRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 10);

    // Static track background
    const trackBg = scene.add.graphics();
    trackBg.fillStyle(0x1e293b, 1);
    trackBg.fillRoundedRect(trackX, ctrlY - TRACK_H / 2, trackW, TRACK_H, 2);

    // Dynamic track fill (updated by updatePlayback)
    this.replayTrackFill = scene.add.graphics();

    // Dynamic playhead circle (updated by updatePlayback)
    this.replayPlayhead = scene.add.graphics();

    // Status text — kept as an off-screen object so setText calls remain valid, not shown in bar
    this.replayStatusLine = scene.add.text(-9999, -9999, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#94a3b8',
    }).setOrigin(0.5, 0);

    // Button style
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#94a3b8',
      backgroundColor: '#0f172a',
      padding: { x: 7, y: 4 },
    };

    // Speed cycle button: 1x → 2x → 0.5x → 1x …
    this.replaySpeedBtn = scene.add.text(speedBtnX, ctrlY, '1x', btnStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.replaySpeedBtn.on('pointerover', () => this.replaySpeedBtn.setColor('#e2e8f0'));
    this.replaySpeedBtn.on('pointerout',  () => this.replaySpeedBtn.setColor('#94a3b8'));
    this.replaySpeedBtn.on('pointerdown', () => {
      this._speedIdx = (this._speedIdx + 1) % this._speedSteps.length;
      const mult = this._speedSteps[this._speedIdx];
      this.replaySpeedBtn.setText(mult === 0.5 ? '0.5x' : `${mult}x`);
      this._onSpeedChange?.(mult);
    });

    this.replayPlayPauseBtn = scene.add.text(btnPlayX, ctrlY, '⏸', btnStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.replayPlayPauseBtn.on('pointerover', () => this.replayPlayPauseBtn.setColor('#e2e8f0'));
    this.replayPlayPauseBtn.on('pointerout',  () => this.replayPlayPauseBtn.setColor('#94a3b8'));
    this.replayPlayPauseBtn.on('pointerdown', () => this._onPlayPause?.());

    // Time label (elapsed / total) on the right
    this.replayTimeLabel = scene.add.text(timeX, ctrlY, '0:00 / 0:00', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#475569',
    }).setOrigin(1, 0.5);

    // Interactive zone over the track for click-to-seek and drag-to-scrub
    const trackZone = scene.add.zone(trackX, ctrlY - 12, trackW, 24).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    trackZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this._draggingTrack = true;
      this._seekFromX(ptr.x);
    });
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (ptr: Phaser.Input.Pointer) => {
      if (this._draggingTrack) this._seekFromX(ptr.x);
    });
    scene.input.on(Phaser.Input.Events.POINTER_UP, () => { this._draggingTrack = false; });

    // Assemble replayBar container (hidden until enterReplayMode)
    this.replayBar = scene.add.container(0, 0, [
      barBg, trackBg, this.replayTrackFill, this.replayPlayhead,
      this.replayStatusLine, this.replaySpeedBtn, this.replayPlayPauseBtn,
      this.replayTimeLabel, trackZone,
    ]).setVisible(false);

    // Sim clock — top-center, shown only in replay mode
    this.simClock = scene.add.text(sceneW / 2, 10, '', {
      fontFamily: 'monospace',
      fontSize:   '15px',
      color:      '#e2e8f0',
      backgroundColor: '#00000099',
      padding:    { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setVisible(false);

    this.hudRoot = scene.add.container(0, 0, [
      homeBtn,
      this.positionText,
      this.cameraModeToggle,
      this.simulationToggle,
      this.sitHint,
      this.actionHint,
      this.entranceHint,
      this.mountHint,
      this.carControlsHint,
      this.replayBar,
      this.simClock,
    ]);
    this.hudRoot.setDepth(HUD_DEPTH);
    this.wireCameraModeTogglePointer();

    this.uiCamera = scene.cameras.add(0, 0, sceneW, sceneH);
    this.uiCamera.ignore(worldObjects);
    scene.cameras.main.ignore(this.hudRoot);
  }

  /** Show or hide all MainMap HUD chrome (coords, camera mode, contextual key hints). Gameplay keys still work. */
  toggleHudChromeVisible(): boolean {
    this.hudChromeVisible = !this.hudChromeVisible;
    this.applyHudChromeVisibility();
    return this.hudChromeVisible;
  }

  private applyHudChromeVisibility(): void {
    this.hudRoot.setVisible(this.hudChromeVisible);
    if (this.hudChromeVisible) {
      this.wireCameraModeTogglePointer();
      this.wireSimulationTogglePointer();
    } else {
      this.cameraModeToggle.disableInteractive();
      this.simulationToggle.disableInteractive();
    }
  }

  private wireCameraModeTogglePointer(): void {
    this.cameraModeToggle
      .setInteractive({ useHandCursor: true })
      .off(Phaser.Input.Events.POINTER_DOWN)
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.onToggleCameraMode());
  }

  private wireSimulationTogglePointer(): void {
    this.simulationToggle
      .setInteractive({ useHandCursor: true })
      .off(Phaser.Input.Events.POINTER_DOWN)
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.onToggleSimulation());
  }

  /** Sync the simulation toggle label to match current state. Called by MainMap. */
  setSimulationActive(active: boolean): void {
    this.simulationToggle.setText(active ? 'simulation: on' : 'simulation: off');
  }

  /** Exclude world-space objects from the HUD ui camera so they only render on `cameras.main` (avoids double-draw). */
  ignoreWorldObjects(...objects: Phaser.GameObjects.GameObject[]): void {
    this.uiCamera.ignore(objects);
  }

  updatePosition(x: number, y: number): void {
    this.positionText.setText(`x: ${Math.round(x)}  y: ${Math.round(y)}`);
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraModeToggle.setText(
      mode === 'follow' ? 'camera: character POV' : 'camera: manual'
    );
  }

  showSitHint(leaving = false): void {
    this.sitHint.setText(leaving ? '[c] leave chair' : '[c] sit').setVisible(true);
    this.layoutBottomContextHints();
  }

  hideSitHint(): void {
    this.sitHint.setVisible(false);
    this.layoutBottomContextHints();
  }

  showActionHint(actionName: string): void {
    this.actionHint
      .setText(`[1] to ${actionName}`)
      .setLineSpacing(0)
      .setVisible(true);
    this.layoutBottomContextHints();
  }

  /**
   * Multiple appliance keys on one row (e.g. desk: `[1] to sales_call` / `[2] to client_research`).
   * Rows are sorted by `key` ascending.
   */
  showMultiKeyActionHints(rows: { key: number; actionName: string }[]): void {
    const sorted = [...rows].sort((a, b) => a.key - b.key);
    this.actionHint
      .setText(sorted.map((r) => `[${r.key}] to ${r.actionName}`).join('\n'))
      .setLineSpacing(4)
      .setVisible(true);
    this.layoutBottomContextHints();
  }

  hideActionHint(): void {
    this.actionHint.setVisible(false);
    this.layoutBottomContextHints();
  }

  showEntranceHint(mode: EntranceMode): void {
    this.entranceHint.setText(mode === 'enter' ? '[e] enter building' : '[e] exit building').setVisible(true);
  }

  hideEntranceHint(): void {
    this.entranceHint.setVisible(false);
  }

  showMountHint(): void {
    this.mountHint.setVisible(true);
  }

  hideMountHint(): void {
    this.mountHint.setVisible(false);
  }

  showCarControls(): void {
    this.carControlsHint.setVisible(true);
  }

  hideCarControls(): void {
    this.carControlsHint.setVisible(false);
  }

  hideContextHints(): void {
    this.hideSitHint();
    this.hideActionHint();
    this.hideEntranceHint();
    this.hideMountHint();
  }

  // ── Replay mode ─────────────────────────────────────────────────────────────

  /** Render/re-render the replay picker button row (called on enter + after selection). */
  private _renderReplayPicker(count: number): void {
    if (this.replayPickerContainer) {
      this.replayPickerContainer.destroy(true);
      this.replayPickerContainer = null;
    }

    // Position right of the home button (home button ends around x=72)
    const startX = 80;
    const y      = 8;
    const btnW   = 24;
    const gap    = 4;

    const items: Phaser.GameObjects.GameObject[] = [];

    const label = this.scene.add.text(startX, y + 4, 'run:', {
      fontFamily: 'monospace', fontSize: '11px', color: '#475569',
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    });
    items.push(label);

    for (let i = 0; i < count; i++) {
      const bx = startX + label.width + gap + i * (btnW + gap);
      const isActive = i === this._currentReplayIndex;
      const btn = this.scene.add.text(bx, y, `${i}`, {
        fontFamily: 'monospace', fontSize: '12px',
        color:           isActive ? '#ffffff' : '#475569',
        backgroundColor: isActive ? '#1d4ed8'  : '#00000088',
        padding: { x: 5, y: 3 },
      }).setInteractive({ useHandCursor: true });

      const idx = i;
      btn.on('pointerover',  () => { if (idx !== this._currentReplayIndex) btn.setColor('#94a3b8'); });
      btn.on('pointerout',   () => { if (idx !== this._currentReplayIndex) btn.setColor('#475569'); });
      btn.on('pointerdown',  () => {
        if (idx === this._currentReplayIndex) return;
        this._currentReplayIndex = idx;
        this._onReplayChange?.(idx);
        this._renderReplayPicker(count);
      });
      items.push(btn);
    }

    this.replayPickerContainer = this.scene.add.container(0, 0, items)
      .setScrollFactor(0).setDepth(HUD_DEPTH + 1);
    this.scene.cameras.main.ignore(this.replayPickerContainer);
  }

  showReplayPicker(initialIndex: number, count: number, onChange: (index: number) => void): void {
    this._currentReplayIndex = initialIndex;
    this._onReplayChange     = onChange;
    this._renderReplayPicker(count);
  }

  hideReplayPicker(): void {
    if (this.replayPickerContainer) {
      this.replayPickerContainer.destroy(true);
      this.replayPickerContainer = null;
    }
    this._onReplayChange = null;
  }

  /** Switch the HUD from sandbox controls to replay playback UI. */
  enterReplayMode(
    totalSteps: number,
    msPerStep: number,
    callbacks: { onPlayPause: () => void; onSeek: (idx: number) => void; onSkip: (steps: number) => void; onSpeedChange: (mult: number) => void },
  ): void {
    this._onPlayPause        = callbacks.onPlayPause;
    this._onSeek             = callbacks.onSeek;
    this._onSkip             = callbacks.onSkip;
    this._onSpeedChange      = callbacks.onSpeedChange;
    this._replayTotalSteps   = totalSteps;
    this._replayMsPerStep    = msPerStep;
    this._replaySkipSteps    = Math.round(10000 / msPerStep); // 10 real seconds of steps
    // Reset speed to 1x on each entry
    this._speedIdx = 0;
    this.replaySpeedBtn.setText('1x');

    this.positionText.setVisible(false);
    this.cameraModeToggle.setVisible(false);
    this.simulationToggle.setVisible(false);
    this.hideContextHints();
    this.carControlsHint.setVisible(false);
    this.replayBar.setVisible(true);
    this.simClock.setVisible(true);
  }

  setSimClock(timeStr: string): void {
    this.simClock.setText(timeStr);
  }

  setPlayPaused(isPaused: boolean): void {
    this.replayPlayPauseBtn.setText(isPaused ? '▶' : '⏸');
  }

  setReplayStatus(emoji: string, desc: string, step: number, total: number, isPaused = false): void {
    this.replayStatusLine.setText(`${emoji}  ${desc}`);
    this._updateScrubber(step, total, isPaused);
  }

  exitReplayMode(): void {
    this.replayBar.setVisible(false);
    this.simClock.setVisible(false);
    this._onPlayPause   = null;
    this._onSeek        = null;
    this._onSkip        = null;
    this._onSpeedChange = null;
    this.hideReplayPicker();
    this.positionText.setVisible(true);
    this.cameraModeToggle.setVisible(true);
    this.simulationToggle.setVisible(true);
    this.showCarControls();
  }

  private _updateScrubber(step: number, total: number, isPaused: boolean): void {
    const frac    = total > 0 ? Math.min(step / total, 1) : 0;
    const fillW   = frac * this._trackW;
    const headX   = this._trackX + frac * this._trackW;
    const TRACK_H = 3;

    this.replayTrackFill.clear();
    if (fillW > 0.5) {
      this.replayTrackFill.fillStyle(0x3b82f6, 1);
      this.replayTrackFill.fillRoundedRect(this._trackX, this._trackCtrlY - TRACK_H / 2, fillW, TRACK_H, 1);
    }

    this.replayPlayhead.clear();
    this.replayPlayhead.fillStyle(0xffffff, 1);
    this.replayPlayhead.fillCircle(headX, this._trackCtrlY, 5);
    this.replayPlayhead.lineStyle(1.5, 0x3b82f6, 1);
    this.replayPlayhead.strokeCircle(headX, this._trackCtrlY, 5);

    this.replayPlayPauseBtn.setText(isPaused ? '▶' : '⏸');

    const elapsedSec = Math.floor((step * this._replayMsPerStep) / 1000);
    const totalSec   = Math.floor((total * this._replayMsPerStep) / 1000);
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.replayTimeLabel.setText(`${fmt(elapsedSec)} / ${fmt(totalSec)}`);
  }

  private _seekFromX(screenX: number): void {
    const frac = Phaser.Math.Clamp((screenX - this._trackX) / this._trackW, 0, 1);
    this._onSeek?.(Math.round(frac * this._replayTotalSteps));
  }

  private layoutBottomContextHints(): void {
    const sitVisible = this.sitHint.visible;
    const actionVisible = this.actionHint.visible;

    if (sitVisible && actionVisible) {
      const gap = 16;
      const sitWidth = this.sitHint.width;
      const actionWidth = this.actionHint.width;
      const totalWidth = sitWidth + gap + actionWidth;
      const rowStartX = this.sceneW / 2 - totalWidth / 2;

      this.sitHint
        .setOrigin(0, 1)
        .setPosition(rowStartX, this.bottomHintY);
      this.actionHint
        .setOrigin(0, 1)
        .setPosition(rowStartX + sitWidth + gap, this.bottomHintY);
      return;
    }

    if (sitVisible) {
      this.sitHint
        .setOrigin(0.5, 1)
        .setPosition(this.sceneW / 2, this.bottomHintY);
    }

    if (actionVisible) {
      this.actionHint
        .setOrigin(0.5, 1)
        .setPosition(this.sceneW / 2, this.bottomHintY);
    }
  }
}
