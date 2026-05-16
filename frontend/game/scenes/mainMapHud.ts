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
  private readonly sceneW: number;
  private readonly bottomHintY: number;
  private readonly onToggleCameraMode: () => void;
  private readonly onToggleSimulation: () => void;
  private readonly hudRoot: Phaser.GameObjects.Container;
  private readonly positionText: Phaser.GameObjects.Text;
  private readonly cameraModeToggle: Phaser.GameObjects.Text;
  private readonly simulationToggle: Phaser.GameObjects.Text;
  private readonly sitHint: Phaser.GameObjects.Text;
  private readonly actionHint: Phaser.GameObjects.Text;
  private readonly entranceHint: Phaser.GameObjects.Text;
  private readonly mountHint: Phaser.GameObjects.Text;
  private readonly carControlsHint: Phaser.GameObjects.Text;
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
  ) {
    this.onToggleCameraMode = onToggleCameraMode;
    this.onToggleSimulation = onToggleSimulation;
    this.sceneW = sceneW;
    this.bottomHintY = sceneH - HUD_BOTTOM_HINT_OFFSET;

    this.positionText = scene.add.text(8, 8, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    });

    this.cameraModeToggle = scene.add.text(8, 36, '', {
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

    this.hudRoot = scene.add.container(0, 0, [
      this.positionText,
      this.cameraModeToggle,
      this.simulationToggle,
      this.sitHint,
      this.actionHint,
      this.entranceHint,
      this.mountHint,
      this.carControlsHint,
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
