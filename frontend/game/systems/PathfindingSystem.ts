import { isPointInAnyPolygon, Polygon } from './CollisionSystem';

const TILE_SIZE = 32;
const GRID_COLS = 90;
const GRID_ROWS = 48;

export interface GridCoord { col: number; row: number; }

export class PathfindingSystem {
  /** Row-major flat array: 0 = walkable, 1 = blocked. */
  private readonly grid: Uint8Array;

  constructor(walkableZones: Polygon[], colliders: Polygon[]) {
    this.grid = new Uint8Array(GRID_COLS * GRID_ROWS);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const px = col * TILE_SIZE + TILE_SIZE / 2;
        const py = row * TILE_SIZE + TILE_SIZE / 2;
        const walkable =
          isPointInAnyPolygon(px, py, walkableZones) &&
          !isPointInAnyPolygon(px, py, colliders);
        if (!walkable) this.grid[row * GRID_COLS + col] = 1;
      }
    }
  }

  isWalkable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false;
    return this.grid[row * GRID_COLS + col] === 0;
  }

  pixelToTile(px: number, py: number): GridCoord {
    return {
      col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(px / TILE_SIZE))),
      row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(py / TILE_SIZE))),
    };
  }

  tileToPixel(coord: GridCoord): { x: number; y: number } {
    return {
      x: coord.col * TILE_SIZE + TILE_SIZE / 2,
      y: coord.row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /**
   * Find a path from startPx to goalPx. Returns an array of tile-center world
   * pixel positions (not including start) or an empty array if unreachable.
   * If the goal tile is blocked (e.g. action point inside a collider), the
   * nearest walkable neighbor tile is used instead.
   */
  findPath(
    startPx: { x: number; y: number },
    goalPx:  { x: number; y: number }
  ): { x: number; y: number }[] {
    const start = this.pixelToTile(startPx.x, startPx.y);
    const goal  = this.pixelToTile(goalPx.x,  goalPx.y);

    if (start.col === goal.col && start.row === goal.row) return [];

    const resolvedGoal = this.isWalkable(goal.col, goal.row)
      ? goal
      : (this._nearestWalkableNeighbor(goal) ?? start);

    return this._astar(start, resolvedGoal);
  }

  private _astar(start: GridCoord, goal: GridCoord): { x: number; y: number }[] {
    const SIZE = GRID_COLS * GRID_ROWS;
    const gScore   = new Float32Array(SIZE).fill(Infinity);
    const fScore   = new Float32Array(SIZE).fill(Infinity);
    const cameFrom = new Int32Array(SIZE).fill(-1);
    const closed   = new Uint8Array(SIZE);

    const startKey = start.row * GRID_COLS + start.col;
    const goalKey  = goal.row  * GRID_COLS + goal.col;

    gScore[startKey] = 0;
    fScore[startKey] = Math.abs(start.col - goal.col) + Math.abs(start.row - goal.row);

    const open: number[] = [startKey];

    const DIRS = [-GRID_COLS, GRID_COLS, -1, 1]; // up, down, left, right (flat index deltas)

    while (open.length > 0) {
      const current = heapPop(open, fScore);

      if (current === goalKey) {
        const path: { x: number; y: number }[] = [];
        let node = current;
        while (node !== startKey) {
          const r = Math.floor(node / GRID_COLS);
          const c = node % GRID_COLS;
          path.push(this.tileToPixel({ col: c, row: r }));
          node = cameFrom[node];
        }
        path.reverse();
        return path;
      }

      if (closed[current]) continue;
      closed[current] = 1;

      const curRow = Math.floor(current / GRID_COLS);
      const curCol = current % GRID_COLS;

      for (let d = 0; d < 4; d++) {
        const nc = curCol + (d === 2 ? -1 : d === 3 ? 1 : 0);
        const nr = curRow + (d === 0 ? -1 : d === 1 ? 1 : 0);
        if (!this.isWalkable(nc, nr)) continue;
        const nKey = nr * GRID_COLS + nc;
        if (closed[nKey]) continue;

        const tentative = gScore[current] + 1;
        if (tentative < gScore[nKey]) {
          cameFrom[nKey] = current;
          gScore[nKey]   = tentative;
          fScore[nKey]   = tentative + Math.abs(nc - goal.col) + Math.abs(nr - goal.row);
          heapPush(open, nKey, fScore);
        }
      }
    }

    return [];
  }

  private _nearestWalkableNeighbor(blocked: GridCoord): GridCoord | null {
    const visited = new Uint8Array(GRID_COLS * GRID_ROWS);
    const queue: GridCoord[] = [blocked];
    visited[blocked.row * GRID_COLS + blocked.col] = 1;

    while (queue.length > 0) {
      const { col, row } = queue.shift()!;
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= GRID_COLS || nr >= GRID_ROWS) continue;
        const k = nr * GRID_COLS + nc;
        if (visited[k]) continue;
        visited[k] = 1;
        if (this.isWalkable(nc, nr)) return { col: nc, row: nr };
        queue.push({ col: nc, row: nr });
      }
    }
    return null;
  }

  /** Draw walkable/blocked tiles onto a Phaser Graphics object for debugging. */
  debugDrawGrid(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const blocked = this.grid[row * GRID_COLS + col] === 1;
        graphics.fillStyle(blocked ? 0xff0000 : 0x00ff00, 0.25);
        graphics.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }
}

function heapPush(heap: number[], val: number, score: Float32Array): void {
  heap.push(val);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (score[heap[parent]] <= score[heap[i]]) break;
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

function heapPop(heap: number[], score: Float32Array): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let s = i;
      if (l < heap.length && score[heap[l]] < score[heap[s]]) s = l;
      if (r < heap.length && score[heap[r]] < score[heap[s]]) s = r;
      if (s === i) break;
      [heap[i], heap[s]] = [heap[s], heap[i]];
      i = s;
    }
  }
  return top;
}
