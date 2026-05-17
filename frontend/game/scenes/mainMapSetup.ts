import Phaser from 'phaser';
import { Car } from '../entities/Car';
import {
  parseObjectLayerPolygons,
  parseNamedObjectLayerPolygons,
  parseNamedPoint,
  type NamedPolygon,
  Polygon,
  type TiledMapJsonRoot,
} from '../systems/CollisionSystem';
import {
  ApplianceInteractable,
  buildApplianceInteractables,
  parseAppliancePolygons,
} from '../systems/ApplianceInteractionSystem';
import {
  Chair,
  parseChairs,
  parseChairPolygons,
} from '../systems/ChairSystem';
import type { OfficeObjectsData } from '../data/officeObjects';
import {
  ACTIVE_CAR,
  defaultHalfSizesForLayout,
  resolvedSheetLayoutForActiveCar,
  sheetInfoForLayout,
} from '../config/carAssets';
import { parseParkingSpots, type ParkingSpot } from '../systems/CarAutoParkSystem';
import { registerCarAnimations } from '../systems/CarAnimationRegistry';
import { TILESET_ASSETS } from '../config/assets';
import {
  CAMERA_WHEEL_ZOOM_SENSITIVITY,
  CHAIR_HIGHLIGHT_DEPTH,
  DEFAULT_CAMERA_ZOOM,
  DEFAULT_CAR_SPAWN,
  DEFAULT_ELEVATOR_ENTRANCE_END,
  DEFAULT_ELEVATOR_ENTRANCE_START,
  DEFAULT_GROUND_ENTRANCE_END,
  DEFAULT_GROUND_ENTRANCE_START,
  FALLBACK_CAMERA_BOUNDS,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM_EPSILON,
  MIN_CAMERA_ZOOM_FLOOR,
  SPRITE_WORLD_DEPTH,
} from './mainMap.constants';

export interface MainMapTilemapSetup {
  map: Phaser.Tilemaps.Tilemap;
  worldObjects: Phaser.GameObjects.GameObject[];
}

export interface MainMapCameraState {
  mapBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  minCameraZoom: number;
  maxCameraZoom: number;
}

export interface MainMapEntrances {
  groundEntranceStart: { x: number; y: number };
  groundEntranceEnd: { x: number; y: number };
  elevatorStart: { x: number; y: number };
  elevatorEnd: { x: number; y: number };
}

export interface MainMapWorldData {
  tiledJSON: TiledMapJsonRoot;
  exteriorWalkable: Polygon[];
  walkableZones: Polygon[];
  zoneAreas: NamedPolygon[];
  colliders: Polygon[];
  entrances: MainMapEntrances;
  chairs: Chair[];
  applianceInteractables: ApplianceInteractable[];
  parkingSpots: ParkingSpot[];
}

export interface MainMapEntities {
  car: Car;
  chairHighlight: Phaser.GameObjects.Graphics;
  applianceHighlight: Phaser.GameObjects.Graphics;
}

export function setupMainMapTilemap(scene: Phaser.Scene): MainMapTilemapSetup | null {
  const map = scene.make.tilemap({
    key: 'dmi_map',
    insertNull: false,
  });

  const tilesets = TILESET_ASSETS
    .map((tileset) => {
      const ts = map.addTilesetImage(tileset.tiledName, tileset.key);
      if (!ts) console.warn(`[MainMap] could not add tileset: "${tileset.tiledName}"`);
      return ts;
    })
    .filter(Boolean) as Phaser.Tilemaps.Tileset[];

  if (tilesets.length === 0) {
    console.error('[MainMap] No tilesets loaded — map will be blank.');
    return null;
  }

  const worldObjects: Phaser.GameObjects.GameObject[] = [];
  let layerCount = 0;
  map.layers.forEach((layerData, index) => {
    if (!layerData.visible) return;
    try {
      const layer = map.createLayer(index, tilesets);
      if (layer) {
        layer.setDepth(index);
        layer.setAlpha(layerData.alpha ?? 1);
        worldObjects.push(layer);
        layerCount++;
      }
    } catch (err) {
      console.warn(`[MainMap] Skipped layer "${layerData.name}":`, err);
    }
  });

  console.log(`[MainMap] Rendered ${layerCount} / ${map.layers.length} tile layers`);
  return { map, worldObjects };
}

export function setupMainMapCamera(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
  sceneW: number,
  sceneH: number,
  canDragPan: () => boolean = () => true
): MainMapCameraState {
  const tileW = map.tileWidth;
  const tileH = map.tileHeight;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  map.layers.forEach((layer) => {
    if (!layer.tilemapLayer) return;
    layer.data.forEach((row) => row.forEach((tile) => {
      if (tile && tile.index > 0) {
        minX = Math.min(minX, tile.pixelX);
        minY = Math.min(minY, tile.pixelY);
        maxX = Math.max(maxX, tile.pixelX + tileW);
        maxY = Math.max(maxY, tile.pixelY + tileH);
      }
    }));
  });

  if (!isFinite(minX) || isNaN(minX)) {
    console.warn('[MainMap] Bounds calculation failed, falling back to origin bounds');
    minX = FALLBACK_CAMERA_BOUNDS.minX;
    minY = FALLBACK_CAMERA_BOUNDS.minY;
    maxX = FALLBACK_CAMERA_BOUNDS.maxX;
    maxY = FALLBACK_CAMERA_BOUNDS.maxY;
  }

  const mapWidth = maxX - minX;
  const mapHeight = maxY - minY;
  console.log(`[MainMap] Camera Bounds: X[${minX} to ${maxX}] Y[${minY} to ${maxY}]`);

  const minZoomByHeight = sceneH / mapHeight;
  const minCameraZoom = Math.max(minZoomByHeight + MIN_CAMERA_ZOOM_EPSILON, MIN_CAMERA_ZOOM_FLOOR);
  const maxCameraZoom = Math.max(MAX_CAMERA_ZOOM, minCameraZoom);

  scene.cameras.main.setBounds(minX, minY, mapWidth, mapHeight);
  scene.cameras.main.setZoom(Phaser.Math.Clamp(DEFAULT_CAMERA_ZOOM, minCameraZoom, maxCameraZoom));
  scene.cameras.main.centerOn(DEFAULT_CAR_SPAWN.x, DEFAULT_CAR_SPAWN.y);

  scene.input.on(
    Phaser.Input.Events.POINTER_WHEEL,
    (_p: unknown, _gos: unknown, _dx: number, deltaY: number) => {
      const zoom = Phaser.Math.Clamp(
        scene.cameras.main.zoom - deltaY * CAMERA_WHEEL_ZOOM_SENSITIVITY,
        minCameraZoom,
        maxCameraZoom
      );
      scene.cameras.main.setZoom(zoom);
    }
  );

  scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
    if (!pointer.isDown || !canDragPan()) return;
    const cam = scene.cameras.main;
    const dx = (pointer.x - pointer.prevPosition.x) / cam.zoom;
    const dy = (pointer.y - pointer.prevPosition.y) / cam.zoom;
    cam.setScroll(cam.scrollX - dx, cam.scrollY - dy);
  });

  return {
    mapBounds: { minX, minY, maxX, maxY, width: mapWidth, height: mapHeight },
    minCameraZoom,
    maxCameraZoom,
  };
}

export function loadMainMapWorldData(scene: Phaser.Scene): MainMapWorldData {
  const tiledJSON = scene.cache.tilemap.get('dmi_map').data as TiledMapJsonRoot;
  const exteriorWalkable = parseObjectLayerPolygons(tiledJSON, 'Exterior Walkable Area');
  const walkableZones = [
    ...parseObjectLayerPolygons(tiledJSON, 'Office Walkable Area'),
    ...exteriorWalkable,
  ];
  const zoneAreas = parseNamedObjectLayerPolygons(tiledJSON, 'Zones');
  const colliders = parseObjectLayerPolygons(tiledJSON, 'Colliders');
  console.log(`[MainMap] Walkable zones: ${walkableZones.length}, Colliders: ${colliders.length}`);

  const officeObjects = scene.cache.json.get('office-objects') as OfficeObjectsData;
  const chairs = parseChairs(officeObjects);
  const chairPolygons = parseChairPolygons(tiledJSON);
  for (const chair of chairs) {
    chair.polygon = chairPolygons.get(chair.id) ?? null;
  }
  console.log(`[MainMap] Chairs loaded: ${chairs.length} (${chairPolygons.size} with polygons)`);

  // Owned chairs are fixed furniture — add their tile polygons as colliders so
  // characters cannot walk through them. Unowned chairs (lobby couch seats etc.)
  // are skipped since they may be moved or occupied dynamically.
  let ownedChairColliderCount = 0;
  for (const chair of chairs) {
    if (chair.owner && chair.polygon) {
      colliders.push({ vertices: chair.polygon });
      ownedChairColliderCount++;
    }
  }
  console.log(`[MainMap] Owned chair colliders added: ${ownedChairColliderCount}`);

  const appliancePolygons = parseAppliancePolygons(tiledJSON);
  const applianceInteractables = buildApplianceInteractables(
    officeObjects,
    appliancePolygons
  );
  console.log(`[MainMap] Appliance interactables loaded: ${applianceInteractables.length}`);

  const parkingSpots = parseParkingSpots(tiledJSON);
  console.log(`[MainMap] Parking spots loaded: ${parkingSpots.length}`);

  return {
    tiledJSON,
    exteriorWalkable,
    walkableZones,
    zoneAreas,
    colliders,
    entrances: {
      groundEntranceStart: parseNamedPoint(tiledJSON, 'ground_entrance_start') ?? DEFAULT_GROUND_ENTRANCE_START,
      groundEntranceEnd: parseNamedPoint(tiledJSON, 'ground_entrance_end') ?? DEFAULT_GROUND_ENTRANCE_END,
      elevatorStart: parseNamedPoint(tiledJSON, 'elevator_entrance_start') ?? DEFAULT_ELEVATOR_ENTRANCE_START,
      elevatorEnd: parseNamedPoint(tiledJSON, 'elevator_entrance_end') ?? DEFAULT_ELEVATOR_ENTRANCE_END,
    },
    chairs,
    applianceInteractables,
    parkingSpots,
  };
}

export function createMainMapEntities(
  scene: Phaser.Scene,
  exteriorWalkable: Polygon[],
  worldObjects: Phaser.GameObjects.GameObject[]
): MainMapEntities {
  const carLayout = resolvedSheetLayoutForActiveCar(ACTIVE_CAR);
  registerCarAnimations(scene, ACTIVE_CAR.textureKey, sheetInfoForLayout(carLayout));

  const { halfLong, halfShort } = defaultHalfSizesForLayout(carLayout);
  const car = new Car({
    scene,
    textureKey: ACTIVE_CAR.textureKey,
    x: DEFAULT_CAR_SPAWN.x,
    y: DEFAULT_CAR_SPAWN.y,
    initialFacing: 'left',
    depth: SPRITE_WORLD_DEPTH,
    walkableZones: exteriorWalkable,
    halfLong,
    halfShort,
  });

  const chairHighlight = scene.add.graphics().setDepth(CHAIR_HIGHLIGHT_DEPTH);
  const applianceHighlight = scene.add.graphics().setDepth(CHAIR_HIGHLIGHT_DEPTH);
  worldObjects.push(car.sprite, chairHighlight, applianceHighlight);

  return { car, chairHighlight, applianceHighlight };
}
