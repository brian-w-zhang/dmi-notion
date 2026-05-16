import Phaser from 'phaser';
import { Character, facingTowardWorldPoint } from '../entities/Character';
import { TalkHeadEmojiOverlay } from '../entities/TalkHeadEmojiOverlay';
import type { ApplianceInteractable, FacingDir } from '../systems/ApplianceInteractionSystem';
import { Chair, nearestSitPoint, setChairOccupancy } from '../systems/ChairSystem';
import { isPointInAnyPolygon, Polygon } from '../systems/CollisionSystem';
import { ApplianceActionController } from '../systems/ApplianceActionController';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { PLAYER_CHARACTER_ID } from './mainMap.constants';
import type { CharacterOwner } from '../config/characters';
import type { MainMapEntrances } from './mainMapSetup';
import type { SpawnedCastMember } from './mainMapCast';
import { QueueTarget, queueTargetKey } from './mainMapHoverHighlight';

const TALK_RADIUS      = 80;
const TALK_DURATION_MS = 3200;
const DWIGHT_TALK_TOPICS: Partial<Record<CharacterOwner, string[]>> = {
  michael: [
    'pitching a new regional strategy',
    'gossiping about downsizing rumors',
    'debating branch morale tactics',
    'brainstorming office party budget cuts',
  ],
  jim: [
    'discussing prank fallout damage control',
    'comparing client follow-up tactics',
    'gossiping about sales floor drama',
    'plotting low-risk mischief plans',
  ],
  pam: [
    'reviewing front desk scheduling conflicts',
    'discussing reception workflow bottlenecks',
    'gossiping about office romance rumors',
    'brainstorming a mural for the bullpen',
  ],
  ryan: [
    'debating startup buzzword strategy',
    'reviewing temp responsibility overload',
    'discussing a questionable growth plan',
    'comparing sales pipeline shortcuts',
  ],
  kelly: [
    'gossiping about break room rumors',
    'analyzing customer drama like reality TV',
    'debating weekend plan rankings',
    'comparing bold fashion decisions',
  ],
  angela: [
    'reviewing strict compliance reminders',
    'discussing aggressive desk organization',
    'swapping cat photo updates',
    'arguing about accounting policy details',
  ],
  oscar: [
    'auditing spreadsheet cleanup mistakes',
    'discussing budget variance concerns',
    'designing process improvement experiments',
    'reviewing quarterly reporting anomalies',
  ],
  kevin: [
    'planning an emergency snack strategy',
    'counting M&M inventory discrepancies',
    'retelling the parking lot chili tragedy',
    'testing very optimistic math shortcuts',
  ],
  stanley: [
    'ranking Pretzel Day contenders',
    'decoding impossible crossword clues',
    'discussing minimal small-talk policy',
    'protecting quiet productivity time',
  ],
  phyllis: [
    'recapping difficult sales calls',
    'sharing client relationship advice',
    'gossiping about break room etiquette',
    'planning office gift exchanges',
  ],
  meredith: [
    'negotiating messy supplier follow-ups',
    'coordinating after-work happy hour logistics',
    'celebrating a coupon discovery',
    'gossiping about warehouse rumors',
  ],
  creed: [
    'describing a mysterious side hustle',
    'retelling unverified office history',
    'questioning suspicious quality checks',
    'pitching a totally normal business lead',
  ],
  toby: [
    'reviewing HR policy updates',
    'mediating lingering team conflict',
    'issuing awkward training reminders',
    'discussing workplace conduct incidents',
  ],
};
const DEFAULT_DWIGHT_TALK_TOPICS = [
  'discussing day-to-day operations',
  'reviewing office task coordination',
  'checking in on branch priorities',
];

export class ActionQueueController {
  private readonly scene: Phaser.Scene;
  private readonly pathfindingSystem: PathfindingSystem;
  private readonly applianceActionController: ApplianceActionController;
  private readonly entrances: MainMapEntrances;
  private readonly exteriorWalkable: Polygon[];
  private readonly onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void;
  private readonly onChairSit: (chairId: number) => void;
  private readonly onDwightTalkBegin: (targetOwner: CharacterOwner) => void;
  private readonly onDwightTalkEnd: (targetOwner: CharacterOwner) => void;

  private _queue: QueueTarget[] = [];
  private _busy = false;
  private _talkTarget: SpawnedCastMember | null = null;
  private _talkTargetEmoji: TalkHeadEmojiOverlay | null = null;
  /** While an active talk dialogue runs; used to keep both parties facing each other. */
  private _dialoguePartner: SpawnedCastMember | null = null;

  constructor(
    scene: Phaser.Scene,
    pathfindingSystem: PathfindingSystem,
    applianceActionController: ApplianceActionController,
    entrances: MainMapEntrances,
    exteriorWalkable: Polygon[],
    onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void,
    onChairSit: (chairId: number) => void,
    onDwightTalkBegin: (targetOwner: CharacterOwner) => void,
    onDwightTalkEnd: (targetOwner: CharacterOwner) => void,
  ) {
    this.scene = scene;
    this.pathfindingSystem = pathfindingSystem;
    this.applianceActionController = applianceActionController;
    this.entrances = entrances;
    this.exteriorWalkable = exteriorWalkable;
    this.onRegisterWorldObject = onRegisterWorldObject;
    this.onChairSit = onChairSit;
    this.onDwightTalkBegin = onDwightTalkBegin;
    this.onDwightTalkEnd = onDwightTalkEnd;
  }

  enqueue(target: QueueTarget): void {
    if (target.kind === 'chair' && target.item.occupiedBy) return;
    const key = queueTargetKey(target)!;
    if (this._queue.some((t) => queueTargetKey(t) === key)) return;
    this._queue.push(target);
  }

  /** Sync the talk-target emoji position. Call once per frame. */
  syncBubbles(): void {
    this._talkTargetEmoji?.syncToTarget();
  }

  /**
   * Keeps Dwight and the partner facing each other while dialogue runs (standing only).
   * Seated characters keep sit facing; `Character.face` already ignores sitting.
   */
  syncTalkFacing(dwight: Character | null): void {
    if (!dwight || !this._dialoguePartner) return;
    const partner = this._dialoguePartner;
    const px = partner.actor.sprite.x;
    const py = partner.actor.sprite.y;
    const dx = dwight.sprite.x;
    const dy = dwight.sprite.y;
    if (!dwight.isSitting) {
      dwight.face(facingTowardWorldPoint(dx, dy, px, py));
    }
    if (!partner.actor.isSitting) {
      partner.actor.face(facingTowardWorldPoint(px, py, dx, dy));
    }
  }

  /** Dequeue and begin the next action if idle. Pass the live chairs array for occupancy checks. */
  processNext(dwight: Character, chairs: Chair[]): void {
    if (this._queue.length === 0 || this._busy || dwight.isSitting) return;

    this._busy = true;
    const target = this._queue.shift()!;

    if (target.kind === 'appliance') {
      const appliance = target.item;
      this.withEntranceIfNeeded(dwight, () => {
        const path = this.pathfindingSystem.findPath(
          { x: dwight.sprite.x, y: dwight.sprite.y },
          appliance.position
        );
        dwight.followPath(path, () => {
          dwight.face(appliance.facing);
          this.applianceActionController.perform(appliance, dwight, () => {
            this._busy = false;
          });
        });
      });
    } else if (target.kind === 'chair') {
      const chair = target.item;
      if (chair.occupiedBy) { this._busy = false; return; }
      this.withEntranceIfNeeded(dwight, () => {
        const sitPoint = nearestSitPoint(chair, dwight.sprite.x, dwight.sprite.y);
        const path = this.pathfindingSystem.findPath(
          { x: dwight.sprite.x, y: dwight.sprite.y },
          sitPoint.position
        );
        dwight.followPath(path, () => {
          dwight.sit(sitPoint.position.x, sitPoint.position.y, sitPoint.facing);
          this.scene.sound.play('Cloth_dig1.ogg', {
            volume: 0.35,
            detune: Phaser.Math.Between(-100, 100),
          });
          setChairOccupancy(chairs, chair.id, PLAYER_CHARACTER_ID);
          this.onChairSit(chair.id);
          this._busy = false;
        });
      });
    } else {
      // person — _busy releases inside startDialogue's onComplete
      const member = target.item;
      this._talkTarget = member;
      this.withEntranceIfNeeded(dwight, () => this.startPursuitPath(dwight, member));
    }
  }

  /** Poll once per frame while a talk target is set; starts dialogue when within TALK_RADIUS. */
  updatePursuit(dwight: Character): void {
    if (!this._talkTarget || this.applianceActionController.isActive) return;

    const tx = this._talkTarget.actor.sprite.x;
    const ty = this._talkTarget.actor.sprite.y;
    const dx = dwight.sprite.x - tx;
    const dy = dwight.sprite.y - ty;

    if (Math.sqrt(dx * dx + dy * dy) <= TALK_RADIUS) {
      dwight.cancelPath();
      this.startDialogue(dwight, this._talkTarget);
      return;
    }

    if (!dwight.isScriptedWalking) this.startPursuitPath(dwight, this._talkTarget);
  }

  /** Cancel everything and reset all state (e.g. when Dwight enters the car). */
  clear(): void {
    if (this._dialoguePartner) {
      this.onDwightTalkEnd(this._dialoguePartner.config.owner);
    }
    this._queue = [];
    this._busy = false;
    this._talkTarget = null;
    this._talkTargetEmoji?.destroy();
    this._talkTargetEmoji = null;
    this._dialoguePartner = null;
  }

  private isOutside(dwight: Character): boolean {
    return isPointInAnyPolygon(dwight.sprite.x, dwight.sprite.y, this.exteriorWalkable);
  }

  private withEntranceIfNeeded(dwight: Character, execute: () => void): void {
    if (!this.isOutside(dwight)) { execute(); return; }

    const { groundEntranceStart, groundEntranceEnd, elevatorStart, elevatorEnd } = this.entrances;
    const entrancePath = this.pathfindingSystem.findPath(
      { x: dwight.sprite.x, y: dwight.sprite.y },
      groundEntranceStart
    );
    dwight.followPath(entrancePath, () => {
      this.scene.sound.play('entrance_door', { volume: 0.4 });
      dwight.walkTo(groundEntranceEnd.x, groundEntranceEnd.y, () => {
        dwight.teleportTo(elevatorStart.x, elevatorStart.y);
        dwight.walkTo(elevatorEnd.x, elevatorEnd.y, execute);
      });
    });
  }

  private startPursuitPath(dwight: Character, target: SpawnedCastMember): void {
    const path = this.pathfindingSystem.findPath(
      { x: dwight.sprite.x, y: dwight.sprite.y },
      { x: target.actor.sprite.x, y: target.actor.sprite.y }
    );
    if (path.length > 0) dwight.followPath(path, () => {});
  }

  private startDialogue(dwight: Character, target: SpawnedCastMember): void {
    this._talkTarget = null;
    this._dialoguePartner = target;
    this.onDwightTalkBegin(target.config.owner);

    const px = target.actor.sprite.x;
    const py = target.actor.sprite.y;
    const dx = dwight.sprite.x;
    const dy = dwight.sprite.y;
    const facingDwight = facingTowardWorldPoint(dx, dy, px, py);
    const facingTarget = facingTowardWorldPoint(px, py, dx, dy);
    if (!dwight.isSitting) dwight.face(facingDwight);
    if (!target.actor.isSitting) target.actor.face(facingTarget);

    this._talkTargetEmoji?.destroy();
    const talkEmoji = TalkHeadEmojiOverlay.attach(this.scene, target.actor.sprite, {
      emojiTextureKey: 'emoji16-talk',
      alpha: 1,
      verticalBobAmplitudePx: 2.5,
      verticalBobPeriodMs: 2800,
      verticalBobPhaseRad: Math.PI * 0.7,
      smoothWalkHorizontalNudge: false,
    });
    this._talkTargetEmoji = talkEmoji;
    this.onRegisterWorldObject(talkEmoji.getRoot());
    talkEmoji.syncToTarget();

    const topic = this.pickDwightTalkTopic(target.config.owner);
    const syntheticAppliance: ApplianceInteractable = {
      objectId: -1,
      objectName: `talk_${target.config.owner}`,
      zone: null,
      actionPointId: -1,
      actionPointName: 'talk',
      actionName: `talking with ${target.config.owner}`,
      emoji: 'talk',
      loadingPhrases: [topic],
      durationMs: TALK_DURATION_MS,
      position: { x: dwight.sprite.x, y: dwight.sprite.y },
      facing: facingDwight as FacingDir,
      polygon: null,
      requiresOccupiedChairId: null,
      skipWalkToActionPoint: true,
      hotkeySlot: null,
    };

    this.applianceActionController.perform(syntheticAppliance, dwight, () => {
      this.onDwightTalkEnd(target.config.owner);
      this._dialoguePartner = null;
      this._talkTargetEmoji?.fadeOutAndDestroy(() => { this._talkTargetEmoji = null; });
      this._busy = false;
    });
  }

  private pickDwightTalkTopic(targetOwner: CharacterOwner): string {
    const topics = DWIGHT_TALK_TOPICS[targetOwner] ?? DEFAULT_DWIGHT_TALK_TOPICS;
    return Phaser.Utils.Array.GetRandom(topics);
  }
}
