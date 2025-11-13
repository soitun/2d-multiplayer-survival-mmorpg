/**
 * Building Visibility / Fog of War Utilities
 * 
 * Handles determining which buildings the player can see inside.
 * When outside a building, you cannot see inside (foundations masked black).
 * When inside a building, you can see both inside and outside.
 */

import { FoundationCell, WallCell, Player } from '../generated';
import { FOUNDATION_TILE_SIZE } from '../config/gameConfig';

// Minimum wall coverage to consider a building "enclosed" (70% = server-side ENCLOSURE_THRESHOLD)
const ENCLOSURE_THRESHOLD = 0.70;

/**
 * Represents a connected cluster of foundations forming a building
 */
export interface BuildingCluster {
  foundationIds: Set<bigint>;
  isEnclosed: boolean;
  cellCoords: Set<string>; // "cellX,cellY" strings for fast lookup
}

/**
 * Get the building cluster that contains a specific foundation
 */
function getFoundationCellKey(cellX: number, cellY: number): string {
  return `${cellX},${cellY}`;
}

/**
 * Check if two foundations are adjacent (within 1 cell distance)
 */
function areFoundationsAdjacent(a: FoundationCell, b: FoundationCell): boolean {
  const dx = Math.abs(a.cellX - b.cellX);
  const dy = Math.abs(a.cellY - b.cellY);
  return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

/**
 * Find all connected foundations starting from a specific foundation (flood fill)
 */
function findConnectedFoundations(
  startFoundation: FoundationCell,
  allFoundations: Map<string, FoundationCell>
): FoundationCell[] {
  const cluster: FoundationCell[] = [];
  const visited = new Set<string>();
  const toVisit: FoundationCell[] = [startFoundation];

  while (toVisit.length > 0) {
    const current = toVisit.pop()!;
    const key = getFoundationCellKey(current.cellX, current.cellY);

    if (visited.has(key)) continue;
    visited.add(key);

    if (current.isDestroyed) continue;

    cluster.push(current);

    // Find adjacent foundations
    for (const [_, other] of allFoundations) {
      const otherKey = getFoundationCellKey(other.cellX, other.cellY);
      if (visited.has(otherKey) || other.isDestroyed) continue;

      if (areFoundationsAdjacent(current, other)) {
        toVisit.push(other);
      }
    }
  }

  return cluster;
}

/**
 * Calculate perimeter edges for a foundation cluster
 * Returns array of edge specifications: "cellX,cellY,edge" where edge is 0=N, 1=E, 2=S, 3=W
 */
function calculatePerimeterEdges(
  cluster: FoundationCell[],
  foundationCoords: Set<string>
): string[] {
  const perimeterEdges: string[] = [];

  for (const foundation of cluster) {
    // Check each cardinal direction
    const directions = [
      { edge: 0, dx: 0, dy: -1 },  // North
      { edge: 1, dx: 1, dy: 0 },   // East
      { edge: 2, dx: 0, dy: 1 },   // South
      { edge: 3, dx: -1, dy: 0 },  // West
    ];

    for (const dir of directions) {
      const adjacentX = foundation.cellX + dir.dx;
      const adjacentY = foundation.cellY + dir.dy;
      const adjacentKey = getFoundationCellKey(adjacentX, adjacentY);

      // If no foundation in this direction, this edge is on the perimeter
      if (!foundationCoords.has(adjacentKey)) {
        perimeterEdges.push(`${foundation.cellX},${foundation.cellY},${dir.edge}`);
      }
    }
  }

  return perimeterEdges;
}

/**
 * Count how many perimeter edges have walls
 */
function countCoveredPerimeterEdges(
  perimeterEdges: string[],
  allWalls: Map<string, WallCell>
): number {
  let covered = 0;

  for (const edgeSpec of perimeterEdges) {
    const [cellXStr, cellYStr, edgeStr] = edgeSpec.split(',');
    const cellX = parseInt(cellXStr, 10);
    const cellY = parseInt(cellYStr, 10);
    const edge = parseInt(edgeStr, 10);

    // Check if a wall exists at this position and edge
    for (const [_, wall] of allWalls) {
      if (wall.isDestroyed) continue;
      if (wall.cellX === cellX && wall.cellY === cellY && wall.edge === edge) {
        covered++;
        break; // Found a wall for this edge
      }
    }
  }

  return covered;
}

/**
 * Check if a building cluster is enclosed (has sufficient wall coverage)
 */
function isClusterEnclosed(
  cluster: FoundationCell[],
  allWalls: Map<string, WallCell>
): boolean {
  if (cluster.length === 0) return false;

  // Build a set of foundation coordinates for fast lookup
  const foundationCoords = new Set<string>();
  for (const f of cluster) {
    foundationCoords.add(getFoundationCellKey(f.cellX, f.cellY));
  }

  // Calculate perimeter edges
  const perimeterEdges = calculatePerimeterEdges(cluster, foundationCoords);
  if (perimeterEdges.length === 0) return false;

  // Count how many perimeter edges have walls
  const coveredEdges = countCoveredPerimeterEdges(perimeterEdges, allWalls);

  // Calculate coverage ratio
  const coverageRatio = coveredEdges / perimeterEdges.length;

  return coverageRatio >= ENCLOSURE_THRESHOLD;
}

/**
 * Get all building clusters from the given foundations
 * Returns a map of clusterId -> BuildingCluster
 */
export function getBuildingClusters(
  allFoundations: Map<string, FoundationCell>,
  allWalls: Map<string, WallCell>
): Map<string, BuildingCluster> {
  const clusters = new Map<string, BuildingCluster>();
  const processedFoundations = new Set<string>();

  for (const [_, foundation] of allFoundations) {
    if (foundation.isDestroyed) continue;

    const key = getFoundationCellKey(foundation.cellX, foundation.cellY);
    if (processedFoundations.has(key)) continue;

    // Find all connected foundations for this cluster
    const clusterFoundations = findConnectedFoundations(foundation, allFoundations);

    // Mark all foundations in this cluster as processed
    const foundationIds = new Set<bigint>();
    const cellCoords = new Set<string>();
    for (const f of clusterFoundations) {
      const fKey = getFoundationCellKey(f.cellX, f.cellY);
      processedFoundations.add(fKey);
      foundationIds.add(f.id);
      cellCoords.add(fKey);
    }

    // Check if this cluster is enclosed
    const isEnclosed = isClusterEnclosed(clusterFoundations, allWalls);

    // Create cluster ID (use first foundation's ID)
    const clusterId = foundation.id.toString();

    clusters.set(clusterId, {
      foundationIds,
      isEnclosed,
      cellCoords,
    });
  }

  return clusters;
}

/**
 * Get the building cluster ID that the player is currently in (if any)
 * Returns null if player is not on any foundation or the foundation is not part of an enclosed building
 */
export function getPlayerBuildingClusterId(
  player: Player | undefined,
  buildingClusters: Map<string, BuildingCluster>
): string | null {
  if (!player) return null;

  // Use the server-side isInsideBuilding flag as the authoritative source
  // This ensures we match the server's enclosure detection logic exactly
  if (!player.isInsideBuilding) {
    return null;
  }

  // Convert player position to foundation cell coordinates
  const playerCellX = Math.floor(player.positionX / FOUNDATION_TILE_SIZE);
  const playerCellY = Math.floor(player.positionY / FOUNDATION_TILE_SIZE);
  const playerCellKey = getFoundationCellKey(playerCellX, playerCellY);

  // Find which cluster contains this foundation cell
  for (const [clusterId, cluster] of buildingClusters) {
    if (cluster.cellCoords.has(playerCellKey)) {
      return clusterId;
    }
  }

  return null;
}

/**
 * Check if a foundation should be masked (fog of war)
 * Returns true if:
 * - The foundation is part of an enclosed building AND
 * - The player is not inside that building
 */
export function shouldMaskFoundation(
  foundation: FoundationCell,
  playerBuildingClusterId: string | null,
  buildingClusters: Map<string, BuildingCluster>
): boolean {
  // Find which cluster this foundation belongs to
  for (const [clusterId, cluster] of buildingClusters) {
    if (cluster.foundationIds.has(foundation.id)) {
      // If this cluster is NOT enclosed, never mask it
      if (!cluster.isEnclosed) {
        return false;
      }

      // If player is inside this building, don't mask it
      if (playerBuildingClusterId === clusterId) {
        return false;
      }

      // Player is outside this enclosed building - mask it!
      return true;
    }
  }

  // Foundation not part of any cluster (shouldn't happen, but safe default)
  return false;
}

