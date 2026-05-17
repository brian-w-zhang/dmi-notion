import Phaser from 'phaser';
import { EventBus } from '../EventBus';
import { registerAnimations } from '../systems/AnimationRegistry';
import { Character, CharacterKeys } from '../entities/Character';
import { Car } from '../entities/Car';
import { isPointInPolygon, type NamedPolygon, Polygon } from '../systems/CollisionSystem';
import type { ApplianceInteractable } from '../systems/ApplianceInteractionSystem';
import { Chair } from '../systems/ChairSystem';
import { MainMapHud } from './mainMapHud';
import {
  createMainMapEntities,
  loadMainMapWorldData,
  MainMapEntrances,
  setupMainMapCamera,
  setupMainMapTilemap,
} from './mainMapSetup';
import { getSfxVolumeScalar } from '../config/soundEffects';
import {
  PLAYER_CHARACTER_ID,
  SPRITE_WORLD_DEPTH,
} from './mainMap.constants';
import { TalkHeadEmojiOverlay } from '../entities/TalkHeadEmojiOverlay';
import { updateOnFootState } from './mainMapOnFoot';
import { spawnStaticCastMembers, type SpawnedCastMember } from './mainMapCast';
import { ApplianceActionController } from '../systems/ApplianceActionController';
import { FootstepSystem } from '../systems/FootstepSystem';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { CarAutoParkSystem, type ParkingSpot } from '../systems/CarAutoParkSystem';
import {
  hitTestTarget,
  drawTargetHighlight,
  queueTargetKey,
  type QueueTarget,
} from './mainMapHoverHighlight';
import { ActionQueueController } from './mainMapActionQueue';
import { NpcActionRunner } from '../systems/NpcActionRunner';
import { NpcDialogueCoordinator } from '../systems/NpcDialogueCoordinator';
import { NPC_ACTION_LOOPS } from '../config/npcActionLoops';
import type { CharacterOwner } from '../config/characters';
import { MainMapReplayController } from './MainMapReplay';

type InputDirection = keyof CharacterKeys;
type CameraMode = 'manual' | 'follow';
const SFX_OPEN_CAR_DOOR = 'open_car_door';
const SFX_CAR_DRIVING = 'car_driving';
const TALK_KEY_RADIUS_PX = 64;

/**
 * MainMap scene: renders the Dunder Mifflin tilemap and runs the simulation loop.
 *
 * Camera controls (mouse only):
 *   - Scroll wheel: zoom
 *   - Click + drag:  pan
 *
 * Controls:
 *   - WASD / arrow keys: drive car or move Dwight on foot
 *   - X: exit car → spawn Dwight at driver door
 *   - X (on foot, near car): enter car → despawn Dwight
 *   - C (on foot): sit / stand from chair
 *   - 1 (on foot, near appliance): walk to action point, perform action, then emote
 *   - 1 / 2 (on foot, seated at Dwight's desk): sales call / client research (desk bundle)
 *   - T (on foot, near NPC): queue a talk interaction with that nearby NPC
 *   - E (on foot): enter / exit building
 *   - H: toggle HUD (coordinates, camera mode label, contextual key hints — gameplay unchanged)
 *   - R: toggle NPC simulation on/off
 */
export class MainMap extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: {
    up:    Phaser.Input.Keyboard.Key;
    down:  Phaser.Input.Keyboard.Key;
    left:  Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  // Car + character state
  private car!:    Car;
  private dwight:  Character | null = null;
  private driving: boolean = true;

  // Stored so exitCar() can pass them to the newly created Character
  private walkableZones:    Polygon[] = [];
  private exteriorWalkable: Polygon[] = [];
  private zoneAreas:        NamedPolygon[] = [];
  private colliders:        Polygon[] = [];

  private cameraMode: CameraMode = 'follow';

  private chairs: Chair[] = [];
  private appliances: ApplianceInteractable[] = [];
  private sitKey!: Phaser.Input.Keyboard.Key;
  private oneKey!: Phaser.Input.Keyboard.Key;
  private twoKey!: Phaser.Input.Keyboard.Key;
  private chairHighlight!:     Phaser.GameObjects.Graphics;
  private highlightedChairId:  number | null = null;
  private applianceHighlight!: Phaser.GameObjects.Graphics;
  private highlightedApplianceId: number | null = null;

  private enterKey!: Phaser.Input.Keyboard.Key;
  private entrances!: MainMapEntrances;

  private xKey!: Phaser.Input.Keyboard.Key;
  private hKey!: Phaser.Input.Keyboard.Key;
  private tKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private heldInputOrder: InputDirection[] = [];
  private prevInputKeys: CharacterKeys = { up: false, down: false, left: false, right: false };

  private hud!: MainMapHud;
  private castMembers: SpawnedCastMember[] = [];
  private occupiedChairId: number | null = null;
  private currentDwightZone: string | null = null;
  private carDrivingSfxKey: string | null = null;

  private applianceActionController!: ApplianceActionController;
  private footstepSystem!: FootstepSystem;
  private pathfindingSystem!: PathfindingSystem;
  private actionQueue!: ActionQueueController;
  private carAutoPark!: CarAutoParkSystem;
  private parkingSpots: ParkingSpot[] = [];
  private hoveredParkingSpot: ParkingSpot | null = null;

  // ── Debug overlay ─────────────────────────────────────────────────────────
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugSpotLabels: Phaser.GameObjects.Text[] = [];
  private debugVisible = false;
  private bKey!: Phaser.Input.Keyboard.Key;

  private hoverHighlight!: Phaser.GameObjects.Graphics;
  private hoveredTarget: QueueTarget | null = null;
  private hoverPersonTalkEmoji: TalkHeadEmojiOverlay | null = null;
  private nearbyTalkPromptEmoji: TalkHeadEmojiOverlay | null = null;
  private nearbyTalkTarget: SpawnedCastMember | null = null;

  // ── NPC simulation ───────────────────────────────────────────────────────
  private _npcRunners: Map<CharacterOwner, NpcActionRunner> = new Map();
  private _npcCoordinator!: NpcDialogueCoordinator;
  private _simulationActive = false;
  /** Shared across all NpcActionRunners: objectName of appliances currently in use. */
  private readonly _npcApplianceOccupancy: Set<string> = new Set();

  // ── Replay mode ──────────────────────────────────────────────────────────
  private _replayMode         = false;
  private _replayCtrl:        MainMapReplayController | null = null;
  private _currentReplayIndex = 0;
  private _replayCount        = 6;

  constructor() {
    super('MainMap');
  }

  init(data?: { replayMode?: boolean }) {
    this._replayMode = data?.replayMode ?? false;
  }

  create() {
    const tilemapSetup = setupMainMapTilemap(this);
    if (!tilemapSetup) return;

    const { map, worldObjects } = tilemapSetup;
    const { width: sceneW, height: sceneH } = this.scale;

    setupMainMapCamera(this, map, sceneW, sceneH, () => this.cameraMode === 'manual');

    const worldData = loadMainMapWorldData(this);
    this.walkableZones    = worldData.walkableZones;
    this.exteriorWalkable = worldData.exteriorWalkable;
    this.zoneAreas        = worldData.zoneAreas;
    this.colliders        = worldData.colliders;
    this.chairs           = worldData.chairs;
    this.appliances       = worldData.applianceInteractables;
    this.entrances        = worldData.entrances;

    const entities = createMainMapEntities(this, worldData.exteriorWalkable, worldObjects);
    this.car               = entities.car;
    this.chairHighlight    = entities.chairHighlight;
    this.applianceHighlight = entities.applianceHighlight;
    this.carAutoPark = new CarAutoParkSystem(worldData.parkingSpots);
    this.parkingSpots = worldData.parkingSpots;

    // Static cast members only needed in sandbox — replay controller spawns its own sprites
    if (!this._replayMode) {
      this.castMembers = spawnStaticCastMembers(this, this.chairs, worldObjects);
    }

    this.hud = new MainMapHud(
      this, sceneW, sceneH, worldObjects, this.cameraMode,
      () => this.toggleCameraMode(),
      () => this._simulationActive ? this.deactivateSimulation() : this.activateSimulation(),
      () => this.scene.start('Preloader'),
    );

    this.pathfindingSystem = new PathfindingSystem(worldData.walkableZones, worldData.colliders);
    this.applianceActionController = new ApplianceActionController(
      this,
      (...objs) => this.hud.ignoreWorldObjects(...objs)
    );
    this.actionQueue = new ActionQueueController(
      this,
      this.pathfindingSystem,
      this.applianceActionController,
      this.entrances,
      this.exteriorWalkable,
      (...objs) => this.hud.ignoreWorldObjects(...objs),
      (chairId) => { this.occupiedChairId = chairId; },
      (targetOwner) => this._npcRunners.get(targetOwner)?.pauseAsTarget(),
      (targetOwner) => this._npcRunners.get(targetOwner)?.resumeFromTarget(),
    );
    this.footstepSystem = new FootstepSystem(this);

    // ── NPC simulation ───────────────────────────────────────────────────
    this._npcCoordinator = new NpcDialogueCoordinator(
      this,
      (owner) => this._npcRunners.get(owner),
      () => this.dwight,
      () => {
        this.actionQueue.clear();
        this.applianceActionController.stopAll();
      },
      (...objs) => this.hud.ignoreWorldObjects(...objs),
    );

    for (const member of this.castMembers) {
      const steps = NPC_ACTION_LOOPS[member.config.owner];
      if (!steps?.length) continue;
      const runner = new NpcActionRunner(
        this,
        member,
        this.pathfindingSystem,
        this.appliances,
        this.chairs,
        (owner) => this.castMembers.find((m) => m.config.owner === owner) ?? null,
        (...objs) => this.hud.ignoreWorldObjects(...objs),
        steps,
        this._npcCoordinator,
        this._npcApplianceOccupancy,
      );
      this._npcRunners.set(member.config.owner, runner);
    }

    this.hoverHighlight = this.add.graphics().setDepth(9997);
    this.hud.ignoreWorldObjects(this.hoverHighlight);

    this.debugGraphics = this.add.graphics().setDepth(9998).setVisible(false);
    this.hud.ignoreWorldObjects(this.debugGraphics);
    for (const spot of this.parkingSpots) {
      const label = this.add.text(spot.x + 8, spot.y - 18, spot.name, {
        fontSize: '11px', fontFamily: 'monospace',
        color: spot.handicap ? '#ffaa00' : '#00ff88',
        backgroundColor: '#00000099', padding: { x: 3, y: 2 },
      }).setDepth(9998).setVisible(false);
      this.hud.ignoreWorldObjects(label);
      this.debugSpotLabels.push(label);
    }

    // ── Replay mode — bypass input, NPC runners, and car driving ─────────────
    if (this._replayMode) {
      // Hide the sandbox car — replay controller manages its own car sprites
      this.car.sprite.setVisible(false);

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.updateHoverHighlight(wp.x, wp.y);
      });
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button !== 0) return;
        // In replay mode character clicks are handled by the controller's sprite handlers.
        // Forward only non-person object clicks to the React overlay.
        if (!this.hoveredTarget) return;
        if (this.hoveredTarget.kind === 'person') return;
        const key = this.hoveredTarget.kind === 'appliance'
          ? this.hoveredTarget.item.objectName
          : this.hoveredTarget.item.name;
        EventBus.emit('object-inspect', key);
      });

      this._replayCtrl = new MainMapReplayController(this, this.hud);
      if (this._replayCtrl.isValid) {
        this._replayCtrl.start();
        // this.hud.showReplayPicker(this._currentReplayIndex, this._replayCount, (idx) => this._switchReplay(idx));
      } else {
        console.error('[MainMap] replay.json missing or empty — switch to sandbox mode');
      }
      EventBus.emit('scene-ready', this);
      return;
    }

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.updateHoverHighlight(wp.x, wp.y);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      if (this.driving) {
        if (this.hoveredParkingSpot) this.startAutoParkToSpot(this.hoveredParkingSpot);
        return;
      }
      if (!this.hoveredTarget) return;
      this.actionQueue.enqueue(this.hoveredTarget);
    });

    this.setupInput();

    if (this.driving) this.startCarDrivingLoop();

    EventBus.emit('scene-ready', this);
  }

  private updateHoverHighlight(worldX: number, worldY: number): void {
    if (this.driving) {
      this.updateDrivingHoverHighlight(worldX, worldY);
      return;
    }
    const hit = hitTestTarget(worldX, worldY, this.appliances, this.chairs, this.castMembers);
    if (queueTargetKey(hit) === queueTargetKey(this.hoveredTarget)) return;
    this.hoveredTarget = hit;
    this.updateHoverPersonTalkEmoji(hit);
    drawTargetHighlight(this.hoverHighlight, hit);
    this.game.canvas.style.cursor = hit ? 'pointer' : 'default';
  }

  private updateDrivingHoverHighlight(worldX: number, worldY: number): void {
    const HOVER_R = 52;
    let closest: ParkingSpot | null = null;
    let bestDist = HOVER_R;
    for (const spot of this.parkingSpots) {
      const dx = worldX - spot.x;
      const dy = worldY - spot.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; closest = spot; }
    }
    if (closest?.name === this.hoveredParkingSpot?.name) return;
    this.hoveredParkingSpot = closest;
    this.hoverHighlight.clear();
    if (closest) {
      this.hoverHighlight.lineStyle(2, 0xffd700, 1);
      this.hoverHighlight.strokePoints(closest.polygon as Phaser.Types.Math.Vector2Like[], true);
    }
    this.game.canvas.style.cursor = closest ? 'pointer' : 'default';
  }

  private updateHoverPersonTalkEmoji(hit: QueueTarget | null): void {
    this.hoverPersonTalkEmoji?.destroy();
    this.hoverPersonTalkEmoji = null;
    if (!hit || hit.kind !== 'person') return;
    if (this.applianceActionController.isTalkActionActive()) return;
    const emoji = TalkHeadEmojiOverlay.attach(this, hit.item.actor.sprite, {
      emojiTextureKey: 'emoji16-talk',
      alpha: 0.5,
      verticalBobAmplitudePx: 2.5,
      verticalBobPeriodMs: 2800,
      verticalBobPhaseRad: Math.PI * 0.7,
      smoothWalkHorizontalNudge: false,
    });
    this.hud.ignoreWorldObjects(emoji.getRoot());
    this.hoverPersonTalkEmoji = emoji;
  }

  private updateNearbyTalkPrompt(dwight: Character | null): void {
    let nextTarget: SpawnedCastMember | null = null;
    if (dwight && !dwight.isSitting && !dwight.isScriptedWalking) {
      let bestDistSq = TALK_KEY_RADIUS_PX * TALK_KEY_RADIUS_PX;
      for (const member of this.castMembers) {
        const dx = dwight.sprite.x - member.actor.sprite.x;
        const dy = dwight.sprite.y - member.actor.sprite.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
          bestDistSq = distSq;
          nextTarget = member;
        }
      }
    }

    if (this.nearbyTalkTarget?.config.owner !== nextTarget?.config.owner) {
      this.nearbyTalkPromptEmoji?.destroy();
      this.nearbyTalkPromptEmoji = null;
      this.nearbyTalkTarget = nextTarget;
      if (nextTarget) {
        const emoji = TalkHeadEmojiOverlay.attach(this, nextTarget.actor.sprite, {
          emojiTextureKey: 'emoji16-talk',
          alpha: 0.5,
          verticalBobAmplitudePx: 2.5,
          verticalBobPeriodMs: 2800,
          verticalBobPhaseRad: Math.PI * 0.7,
          smoothWalkHorizontalNudge: false,
        });
        this.hud.ignoreWorldObjects(emoji.getRoot());
        this.nearbyTalkPromptEmoji = emoji;
      }
    }
    this.nearbyTalkPromptEmoji?.syncToTarget();
  }

  // ── Enter / exit car ─────────────────────────────────────────────────────

  private playOpenCarDoorSfx(): void {
    this.sound.play(SFX_OPEN_CAR_DOOR, { volume: getSfxVolumeScalar(SFX_OPEN_CAR_DOOR) });
  }

  private startCarDrivingLoop(): void {
    this.stopCarDrivingLoop();
    this.sound.play(SFX_CAR_DRIVING, { loop: true, volume: getSfxVolumeScalar(SFX_CAR_DRIVING) });
    this.carDrivingSfxKey = SFX_CAR_DRIVING;
  }

  private stopCarDrivingLoop(): void {
    if (!this.carDrivingSfxKey) return;
    this.sound.stopByKey(this.carDrivingSfxKey);
    this.carDrivingSfxKey = null;
  }

  private exitCar(): void {
    this.carAutoPark.cancel();
    this.playOpenCarDoorSfx();
    this.stopCarDrivingLoop();
    registerAnimations(this, 'dwight-schrute');

    const door = this.car.getDriverDoorPosition();
    this.dwight = new Character({
      scene:         this,
      spriteKey:     'dwight-schrute',
      x:             door.x,
      y:             door.y,
      depth:         SPRITE_WORLD_DEPTH,
      walkableZones: this.walkableZones,
      colliders:     [...this.colliders, this.car.getColliderPolygon()],
    });
    this.hud.ignoreWorldObjects(this.dwight.sprite);
    this.driving = false;
    this.hud.hideCarControls();
    this.updateDwightZoneTracking();
  }

  private enterCar(): void {
    this.playOpenCarDoorSfx();
    this.applianceActionController.stopAll();
    this.actionQueue.clear();
    this.deactivateSimulation();
    this.dwight?.sprite.destroy();
    this.dwight = null;
    this.driving = true;
    this.nearbyTalkPromptEmoji?.destroy();
    this.nearbyTalkPromptEmoji = null;
    this.nearbyTalkTarget = null;
    this.occupiedChairId = null;
    this.hud.hideContextHints();
    this.hud.showCarControls();
    this.currentDwightZone = null;
    this.chairHighlight.clear();
    this.applianceHighlight.clear();
    this.highlightedChairId = null;
    this.highlightedApplianceId = null;
    this.startCarDrivingLoop();
  }

  private startAutoParkToSpot(spot: ParkingSpot): void {
    const { x, y } = this.car.getPivot();
    this.carAutoPark.startAtSpot(spot, x, y);
  }

  // ── Zone tracking ────────────────────────────────────────────────────────

  private resolveDwightZoneName(): string | null {
    const dwight = this.dwight;
    if (!dwight) return null;
    const feetX = dwight.sprite.x;
    const feetY = dwight.sprite.y - 32;
    for (const zoneArea of this.zoneAreas) {
      if (isPointInPolygon(feetX, feetY, zoneArea.polygon)) return zoneArea.name;
    }
    return null;
  }

  private updateDwightZoneTracking(): void {
    this.currentDwightZone = this.resolveDwightZoneName();
  }

  getCurrentDwightZone(): string | null {
    return this.currentDwightZone;
  }

  getPathfindingSystem(): PathfindingSystem {
    return this.pathfindingSystem;
  }

  // ── Input order helpers ──────────────────────────────────────────────────

  private updateHeldInputOrder(keys: CharacterKeys): void {
    const dirs: InputDirection[] = ['up', 'down', 'left', 'right'];
    for (const dir of dirs) {
      const wasDown = this.prevInputKeys[dir];
      const isDown = keys[dir];
      if (!wasDown && isDown)  this.heldInputOrder.push(dir);
      else if (wasDown && !isDown) this.heldInputOrder = this.heldInputOrder.filter((d) => d !== dir);
      this.prevInputKeys[dir] = isDown;
    }
  }

  private getOldestHeldDirection(keys: CharacterKeys): InputDirection | null {
    this.heldInputOrder = this.heldInputOrder.filter((d) => keys[d]);
    return this.heldInputOrder[0] ?? null;
  }

  // ── Driving update ───────────────────────────────────────────────────────

  private updateDriving(inputKeys: CharacterKeys, xPressed: boolean): void {
    const playerMoving = inputKeys.up || inputKeys.down || inputKeys.left || inputKeys.right;
    if (this.carAutoPark.isActive && playerMoving) this.carAutoPark.cancel();

    const pivot = this.car.getPivot();
    const autoKeys = this.carAutoPark.tick(pivot.x, pivot.y);

    // Snap y exactly to the spot centroid when align-spot-y completes, so the
    // approach direction (up vs down) doesn't cause vertical misalignment.
    const snapY = this.carAutoPark.consumeSnapY();
    if (snapY !== null) this.car.snapToPivot(pivot.x, snapY);

    const effectiveKeys = autoKeys ?? inputKeys;
    const effectiveShift = autoKeys ? false : this.shiftKey.isDown;
    const effectiveOldest = autoKeys ? null : this.getOldestHeldDirection(inputKeys);

    this.car.update(effectiveKeys, effectiveShift, effectiveOldest);
    if (xPressed) this.exitCar();
    const newPivot = this.car.getPivot();
    this.syncCameraToTarget(newPivot.x, newPivot.y);
    this.hud.updatePosition(newPivot.x, newPivot.y);
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  private toggleCameraMode(): void {
    this.cameraMode = this.cameraMode === 'manual' ? 'follow' : 'manual';
    this.hud.setCameraMode(this.cameraMode);
    if (this.cameraMode === 'follow') {
      const target = this.driving
        ? this.car.getPivot()
        : this.dwight ? { x: this.dwight.sprite.x, y: this.dwight.sprite.y } : null;
      if (target) this.cameras.main.centerOn(target.x, target.y);
    }
  }

  private syncCameraToTarget(x: number, y: number): void {
    if (this.cameraMode !== 'follow') return;
    this.cameras.main.centerOn(x, y);
  }

  // ── Input setup ──────────────────────────────────────────────────────────

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.sitKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.oneKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.twoKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.xKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.hKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.tKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.rKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.bKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
  }

  // ── Update loop ──────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    // Replay speech bubbles need per-frame sync even in replay mode
    this._replayCtrl?.update();
    // Replay mode: timer-driven step playback — no keyboard input, no NPC runners
    if (this._replayMode) return;

    const xPressed = Phaser.Input.Keyboard.JustDown(this.xKey);
    const tPressed = Phaser.Input.Keyboard.JustDown(this.tKey);
    const inputKeys: CharacterKeys = {
      up:    this.cursors.up.isDown    || this.keys.up.isDown,
      down:  this.cursors.down.isDown  || this.keys.down.isDown,
      left:  this.cursors.left.isDown  || this.keys.left.isDown,
      right: this.cursors.right.isDown || this.keys.right.isDown,
    };
    this.updateHeldInputOrder(inputKeys);

    if (Phaser.Input.Keyboard.JustDown(this.hKey)) this.hud.toggleHudChromeVisible();
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this._simulationActive ? this.deactivateSimulation() : this.activateSimulation();
    }
    if (Phaser.Input.Keyboard.JustDown(this.bKey)) {
      this.debugVisible = !this.debugVisible;
      this.debugGraphics.setVisible(this.debugVisible);
      this.debugSpotLabels.forEach(l => l.setVisible(this.debugVisible));
    }

    this.hoverPersonTalkEmoji?.syncToTarget();
    this.actionQueue.syncBubbles();
    this.actionQueue.syncTalkFacing(this.dwight);
    this.applianceActionController.tick(this.dwight);

    // NPC runners tick before the driving guard so NPCs animate regardless of car state.
    for (const runner of this._npcRunners.values()) {
      runner.update(this.dwight);
      runner.syncBubbles();
    }
    this._npcCoordinator.tick(this.dwight);

    if (this.driving) {
      this.updateNearbyTalkPrompt(null);
      this.updateDriving(inputKeys, xPressed);
      if (this.debugVisible) this.renderDebugOverlay();
      return;
    }

    const dwight = this.dwight;
    if (!dwight) return;

    this.updateNearbyTalkPrompt(dwight);
    if (tPressed && this.nearbyTalkTarget) {
      this.actionQueue.enqueue({ kind: 'person', item: this.nearbyTalkTarget });
    }

    const cPressed   = Phaser.Input.Keyboard.JustDown(this.sitKey);
    const onePressed = Phaser.Input.Keyboard.JustDown(this.oneKey);
    const twoPressed = Phaser.Input.Keyboard.JustDown(this.twoKey);
    const ePressed   = Phaser.Input.Keyboard.JustDown(this.enterKey);

    const prevOccupiedChairId = this.occupiedChairId;
    const updateResult = updateOnFootState({
      dwight,
      playerId: PLAYER_CHARACTER_ID,
      inputKeys,
      cPressed,
      xPressed,
      ePressed,
      onePressed,
      twoPressed,
      chairs:              this.chairs,
      appliances:          this.appliances,
      occupiedChairId:     this.occupiedChairId,
      highlightedChairId:  this.highlightedChairId,
      highlightedApplianceId: this.highlightedApplianceId,
      chairHighlight:      this.chairHighlight,
      applianceHighlight:  this.applianceHighlight,
      car:                 this.car,
      entrances:           this.entrances,
      hud:                 this.hud,
      isPerformingApplianceAction: this.applianceActionController.isActive,
      onApplianceAction: (appliance) => this.applianceActionController.perform(appliance, dwight),
      onSit:   () => this.sound.play('Cloth_dig1.ogg', { volume: 0.35, detune: Phaser.Math.Between(-100, 100) }),
      onStand: () => this.sound.play('Cloth_dig3.ogg', { volume: 0.3,  detune: Phaser.Math.Between(-100, 100) }),
      onDoor:  () => this.sound.play('entrance_door', { volume: 0.4 }),
    });

    this.highlightedChairId      = updateResult.highlightedChairId;
    this.highlightedApplianceId  = updateResult.highlightedApplianceId;
    // Guard: if the queue's chair-sit callback already updated occupiedChairId this frame
    // (fired inside dwight.update → _advancePath), don't let the stale result overwrite it.
    if (this.occupiedChairId === prevOccupiedChairId) {
      this.occupiedChairId = updateResult.occupiedChairId;
    }

    if (updateResult.shouldMount) this.enterCar();
    this.actionQueue.updatePursuit(dwight);
    this.actionQueue.processNext(dwight, this.chairs);
    this.footstepSystem.update(dwight.isWalking, delta);
    this.syncCameraToTarget(dwight.sprite.x, dwight.sprite.y);
    this.hud.updatePosition(dwight.sprite.x, dwight.sprite.y);
    this.updateDwightZoneTracking();
    if (this.debugVisible) this.renderDebugOverlay();
  }

  // ── Debug overlay ─────────────────────────────────────────────────────────

  private renderDebugOverlay(): void {
    const g = this.debugGraphics;
    g.clear();

    // Parking spots — green circles for normal, orange for handicap
    for (const spot of this.parkingSpots) {
      const color = spot.handicap ? 0xffaa00 : 0x00ff88;
      g.fillStyle(color, 0.7);
      g.fillCircle(spot.x, spot.y, 7);
      g.lineStyle(1.5, color, 1);
      g.strokeCircle(spot.x, spot.y, 7);
      // Crosshair so you can see the exact point
      g.lineStyle(1, color, 0.8);
      g.lineBetween(spot.x - 14, spot.y, spot.x + 14, spot.y);
      g.lineBetween(spot.x, spot.y - 14, spot.x, spot.y + 14);
    }

    // Car collider polygon (cyan)
    const poly = this.car.getColliderPolygon();
    g.lineStyle(2, 0x00ffff, 1);
    g.strokePoints(poly.vertices as Phaser.Types.Math.Vector2Like[], true);

    // Red dot at the geometric centre of the collider polygon (average of vertices).
    const verts = poly.vertices;
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
    g.fillStyle(0xff3333, 1);
    g.fillCircle(cx, cy, 5);
    g.lineStyle(2, 0xff3333, 1);
    g.lineBetween(cx - 18, cy, cx + 18, cy);
    g.lineBetween(cx, cy - 18, cx, cy + 18);
  }

  // ── Simulation toggle ─────────────────────────────────────────────────────

  activateSimulation(): void {
    if (this._simulationActive) return;
    this._simulationActive = true;
    for (const runner of this._npcRunners.values()) runner.activate();
    this.hud.setSimulationActive(true);
  }

  deactivateSimulation(): void {
    if (!this._simulationActive) return;
    this._simulationActive = false;
    this._npcCoordinator.cancelAll();
    for (const runner of this._npcRunners.values()) runner.deactivate();
    this.hud.setSimulationActive(false);
  }

  private async _switchReplay(index: number): Promise<void> {
    this._currentReplayIndex = index;
    this._replayCtrl?.destroy();
    this._replayCtrl = null;
    this.hud.exitReplayMode();

    const url = `/assets/simulation/replay ${index}.json`;
    let data: object;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      console.error(`[MainMap] failed to load replay ${index}:`, e);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._replayCtrl = new MainMapReplayController(this, this.hud, data as any);
    if (this._replayCtrl.isValid) {
      this._replayCtrl.start();
      this.hud.showReplayPicker(index, this._replayCount, (i) => this._switchReplay(i));
    }
  }
}
