import Phaser from 'phaser';
import { Car } from '../entities/Car';
import { Character, CharacterKeys } from '../entities/Character';
import {
  activeSeatedBundle,
  ApplianceInteractable,
  nearbyApplianceBundleInRange,
  nearestApplianceInRange,
} from '../systems/ApplianceInteractionSystem';
import {
  Chair,
  nearestChairInRange,
  nearestSitPoint,
  setChairOccupancy,
} from '../systems/ChairSystem';
import { MainMapHud } from './mainMapHud';
import {
  APPLIANCE_INTERACTION_RADIUS,
  CAR_MOUNT_RADIUS,
  CHAIR_INTERACTION_RADIUS,
  ENTRANCE_INTERACTION_RADIUS,
} from './mainMap.constants';
import { MainMapEntrances } from './mainMapSetup';

export interface OnFootUpdateArgs {
  dwight: Character;
  playerId: string;
  inputKeys: CharacterKeys;
  cPressed: boolean;
  xPressed: boolean;
  ePressed: boolean;
  onePressed: boolean;
  twoPressed: boolean;
  chairs: Chair[];
  appliances: ApplianceInteractable[];
  occupiedChairId: number | null;
  highlightedChairId: number | null;
  highlightedApplianceId: number | null;
  chairHighlight: Phaser.GameObjects.Graphics;
  applianceHighlight: Phaser.GameObjects.Graphics;
  car: Car;
  entrances: MainMapEntrances;
  hud: MainMapHud;
  isPerformingApplianceAction: boolean;
  onApplianceAction: (appliance: ApplianceInteractable) => void;
  onSit: () => void;
  onStand: () => void;
  onDoor: () => void;
}

export interface OnFootUpdateResult {
  highlightedChairId: number | null;
  highlightedApplianceId: number | null;
  occupiedChairId: number | null;
  shouldMount: boolean;
}

function isWithinRadius(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  radius: number
): boolean {
  const dx = x - targetX;
  const dy = y - targetY;
  return (dx * dx + dy * dy) < radius * radius;
}

export function updateOnFootState(args: OnFootUpdateArgs): OnFootUpdateResult {
  const {
    dwight,
    playerId,
    inputKeys,
    cPressed,
    xPressed,
    ePressed,
    onePressed,
    twoPressed,
    chairs,
    appliances,
    occupiedChairId,
    highlightedChairId,
    highlightedApplianceId,
    chairHighlight,
    applianceHighlight,
    car,
    entrances,
    hud,
    isPerformingApplianceAction,
    onApplianceAction,
    onSit,
    onStand,
    onDoor,
  } = args;

  if (isPerformingApplianceAction) {
    dwight.update({ up: false, down: false, left: false, right: false });
    hud.hideSitHint();
    hud.hideActionHint();
    hud.hideEntranceHint();
    hud.hideMountHint();
    return {
      highlightedChairId,
      highlightedApplianceId,
      occupiedChairId,
      shouldMount: false,
    };
  }

  if (dwight.isSitting) {
    hud.showSitHint(true);

    const { x, y } = dwight.sprite;
    const feetX = x;
    const feetY = y - 32;

    const seatedBundle = activeSeatedBundle(appliances, occupiedChairId);

    let nextApplianceIdSeated: number | null = null;

    if (seatedBundle.length >= 1) {
      if (seatedBundle.length >= 2) {
        hud.showMultiKeyActionHints(
          seatedBundle.map((a) => ({ key: a.hotkeySlot!, actionName: a.actionName }))
        );
      } else {
        hud.showActionHint(seatedBundle[0]!.actionName);
      }
      nextApplianceIdSeated = seatedBundle[0]?.objectId ?? null;
      if (nextApplianceIdSeated !== highlightedApplianceId) {
        applianceHighlight.clear();
        for (const item of seatedBundle) {
          if (item.polygon) {
            applianceHighlight.lineStyle(2, 0xffd700, 1);
            applianceHighlight.strokePoints(item.polygon, true);
          }
        }
      }

      if (cPressed) {
        dwight.stand();
        onStand();
        if (occupiedChairId !== null) setChairOccupancy(chairs, occupiedChairId, null);
        hud.hideSitHint();
        hud.hideActionHint();
        chairHighlight.clear();
        applianceHighlight.clear();
        return {
          highlightedChairId: null,
          highlightedApplianceId: null,
          occupiedChairId: null,
          shouldMount: false,
        };
      }

      const runSeated = (slot: number): ApplianceInteractable | null =>
        seatedBundle.find((a) => a.hotkeySlot === slot) ?? null;

      const seatedTarget = onePressed ? runSeated(1) : twoPressed ? runSeated(2) : null;
      if (seatedTarget) {
        hud.hideActionHint();
        dwight.face(seatedTarget.facing);
        onApplianceAction(seatedTarget);
        return {
          highlightedChairId,
          highlightedApplianceId: seatedTarget.objectId,
          occupiedChairId,
          shouldMount: false,
        };
      }

      return {
        highlightedChairId,
        highlightedApplianceId: nextApplianceIdSeated,
        occupiedChairId,
        shouldMount: false,
      };
    }

    const nearWhileSeated = nearestApplianceInRange(
      appliances,
      feetX,
      feetY,
      APPLIANCE_INTERACTION_RADIUS,
      { isSitting: true, occupiedChairId }
    );
    if (nearWhileSeated) hud.showActionHint(nearWhileSeated.actionName);
    else hud.hideActionHint();

    const nextApplianceIdSeated2 = nearWhileSeated?.objectId ?? null;
    if (nextApplianceIdSeated2 !== highlightedApplianceId) {
      applianceHighlight.clear();
      if (nearWhileSeated?.polygon) {
        applianceHighlight.lineStyle(2, 0xffd700, 1);
        applianceHighlight.strokePoints(nearWhileSeated.polygon, true);
      }
    }

    if (cPressed) {
      dwight.stand();
      onStand();
      if (occupiedChairId !== null) setChairOccupancy(chairs, occupiedChairId, null);
      hud.hideSitHint();
      hud.hideActionHint();
      chairHighlight.clear();
      applianceHighlight.clear();
      return {
        highlightedChairId: null,
        highlightedApplianceId: null,
        occupiedChairId: null,
        shouldMount: false,
      };
    }

    if (nearWhileSeated && onePressed) {
      hud.hideActionHint();
      if (nearWhileSeated.skipWalkToActionPoint) {
        dwight.face(nearWhileSeated.facing);
        onApplianceAction(nearWhileSeated);
      } else {
        dwight.walkTo(nearWhileSeated.position.x, nearWhileSeated.position.y, () => {
          dwight.face(nearWhileSeated.facing);
          onApplianceAction(nearWhileSeated);
        });
      }
      return {
        highlightedChairId,
        highlightedApplianceId: nearWhileSeated.objectId,
        occupiedChairId,
        shouldMount: false,
      };
    }

    return {
      highlightedChairId,
      highlightedApplianceId: nextApplianceIdSeated2,
      occupiedChairId,
      shouldMount: false,
    };
  }

  if (dwight.isScriptedWalking) {
    dwight.update({ up: false, down: false, left: false, right: false });
    hud.hideActionHint();
    applianceHighlight.clear();
    return {
      highlightedChairId,
      highlightedApplianceId: null,
      occupiedChairId,
      shouldMount: false,
    };
  }

  dwight.update(inputKeys);

  const { x, y } = dwight.sprite;
  const feetX = x;
  const feetY = y - 32;

  const nearChair = nearestChairInRange(chairs, feetX, feetY, CHAIR_INTERACTION_RADIUS, false);
  if (nearChair) hud.showSitHint(false);
  else hud.hideSitHint();

  const nearBundle = nearbyApplianceBundleInRange(
    appliances,
    feetX,
    feetY,
    APPLIANCE_INTERACTION_RADIUS,
    { isSitting: dwight.isSitting, occupiedChairId }
  );
  const nearAppliance = nearBundle[0] ?? null;

  if (nearBundle.length > 1) {
    hud.showMultiKeyActionHints(nearBundle.map((a) => ({ key: a.hotkeySlot!, actionName: a.actionName })));
  } else if (nearAppliance) {
    hud.showActionHint(nearAppliance.actionName);
  } else {
    hud.hideActionHint();
  }

  const nextHighlightedChairId = nearChair?.id ?? null;
  const nextHighlightedApplianceId = nearAppliance?.objectId ?? null;
  if (nextHighlightedChairId !== highlightedChairId) {
    chairHighlight.clear();
    if (nearChair?.polygon) {
      chairHighlight.lineStyle(2, 0xffd700, 1);
      chairHighlight.strokePoints(nearChair.polygon, true);
    }
  }
  if (nextHighlightedApplianceId !== highlightedApplianceId) {
    applianceHighlight.clear();
    if (nearAppliance?.polygon) {
      applianceHighlight.lineStyle(2, 0xffd700, 1);
      applianceHighlight.strokePoints(nearAppliance.polygon, true);
    }
  }

  if (nearChair && cPressed) {
    const sitPoint = nearestSitPoint(nearChair, x, y);
    dwight.sit(sitPoint.position.x, sitPoint.position.y, sitPoint.facing);
    onSit();
    setChairOccupancy(chairs, nearChair.id, playerId);
    chairHighlight.clear();
    return {
      highlightedChairId: null,
      highlightedApplianceId: nextHighlightedApplianceId,
      occupiedChairId: nearChair.id,
      shouldMount: false,
    };
  }

  function triggerAppliance(target: ApplianceInteractable) {
    hud.hideActionHint();
    if (target.skipWalkToActionPoint) {
      dwight.face(target.facing);
      onApplianceAction(target);
    } else {
      dwight.walkTo(target.position.x, target.position.y, () => {
        dwight.face(target.facing);
        onApplianceAction(target);
      });
    }
  }

  if (nearBundle.length > 1) {
    const slotTarget = onePressed
      ? nearBundle.find((a) => a.hotkeySlot === 1) ?? null
      : twoPressed
        ? nearBundle.find((a) => a.hotkeySlot === 2) ?? null
        : null;
    if (slotTarget) {
      triggerAppliance(slotTarget);
      return {
        highlightedChairId: nextHighlightedChairId,
        highlightedApplianceId: slotTarget.objectId,
        occupiedChairId,
        shouldMount: false,
      };
    }
  } else if (nearAppliance && onePressed) {
    triggerAppliance(nearAppliance);
    return {
      highlightedChairId: nextHighlightedChairId,
      highlightedApplianceId: nearAppliance.objectId,
      occupiedChairId,
      shouldMount: false,
    };
  }

  const carPivot = car.getPivot();
  const nearCar = isWithinRadius(x, y, carPivot.x, carPivot.y, CAR_MOUNT_RADIUS);
  if (nearCar) {
    hud.showMountHint();
    hud.hideEntranceHint();
    hud.hideActionHint();
    return {
      highlightedChairId: nextHighlightedChairId,
      highlightedApplianceId: nextHighlightedApplianceId,
      occupiedChairId,
      shouldMount: xPressed,
    };
  }

  hud.hideMountHint();

  const nearEntrance = isWithinRadius(
    feetX,
    feetY,
    entrances.groundEntranceStart.x,
    entrances.groundEntranceStart.y,
    ENTRANCE_INTERACTION_RADIUS
  );
  const nearExit = isWithinRadius(
    feetX,
    feetY,
    entrances.elevatorEnd.x,
    entrances.elevatorEnd.y,
    ENTRANCE_INTERACTION_RADIUS
  );

  if (nearEntrance) hud.showEntranceHint('enter');
  else if (nearExit) hud.showEntranceHint('exit');
  else hud.hideEntranceHint();

  if (nearEntrance || nearExit) hud.hideActionHint();

  if (nearEntrance && ePressed) {
    hud.hideEntranceHint();
    hud.hideActionHint();
    onDoor();
    dwight.walkTo(entrances.groundEntranceEnd.x, entrances.groundEntranceEnd.y, () => {
      dwight.teleportTo(entrances.elevatorStart.x, entrances.elevatorStart.y);
      dwight.walkTo(entrances.elevatorEnd.x, entrances.elevatorEnd.y, () => {});
    });
  }

  if (nearExit && ePressed) {
    hud.hideEntranceHint();
    hud.hideActionHint();
    dwight.walkTo(entrances.elevatorStart.x, entrances.elevatorStart.y, () => {
      dwight.teleportTo(entrances.groundEntranceEnd.x, entrances.groundEntranceEnd.y);
      onDoor();
      dwight.walkTo(entrances.groundEntranceStart.x, entrances.groundEntranceStart.y, () => {});
    });
  }

  return {
    highlightedChairId: nextHighlightedChairId,
    highlightedApplianceId: nextHighlightedApplianceId,
    occupiedChairId,
    shouldMount: false,
  };
}
