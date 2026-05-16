import type { Direction } from './characterAnimations';

export interface Point {
  x: number;
  y: number;
}

export interface SitPoint {
  id: number;
  name: string;
  position: Point;
  facing: Direction;
}

export interface ActionPoint {
  id: number;
  name: string;
  position: Point;
  facing: Direction;
}

interface BaseEntity {
  id: number;
  name: string;
  zone: string | null;
  center: Point;
  /** Populated at runtime by merging with actions_config.json */
  actions: string[];
}

export interface ChairEntity extends BaseEntity {
  entityType: 'chair';
  owner: string | null;
  sitPoints: SitPoint[];
  actionPoints: ActionPoint[];
}

export interface TableEntity extends BaseEntity {
  entityType: 'table';
  owner: string | null;
  actionPoints: ActionPoint[];
}

export interface ApplianceEntity extends BaseEntity {
  entityType: 'appliance';
  actionPoints: ActionPoint[];
}

export interface StorageEntity extends BaseEntity {
  entityType: 'storage';
  actionPoints: ActionPoint[];
}

export type OfficeEntity = ChairEntity | TableEntity | ApplianceEntity | StorageEntity;

export interface EntranceEntity {
  id: number;
  name: string;
  /** Zone this entrance belongs to, or null if unresolved. */
  zone: string | null;
  center: Point;
  actionPoints: ActionPoint[];
}

export interface Zone {
  id: number;
  name: string;
  entities: OfficeEntity[];
}

export interface OfficeObjectsData {
  /** Zone lookup by zone name (e.g. "sales", "kitchen"). */
  zones: Record<string, Zone>;
  /**
   * Flat lookup of all entities by Tiled object ID.
   * Entities with zone=null appear here but not in any zone's entity list.
   */
  entitiesById: Record<number, OfficeEntity>;
  /** Entrance lookup by entrance name. */
  entrances: Record<string, EntranceEntity>;
  meta: {
    generatedAt: string;
    sourceFile: string;
    counts: {
      zones: number;
      chairs: number;
      tables: number;
      appliances: number;
      storage: number;
      entrances: number;
      parkingSpots: number;
      sitPoints: number;
      actionPoints: number;
    };
  };
}
